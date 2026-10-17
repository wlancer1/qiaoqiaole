#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>

// ESP32-S3 -> HUB75E (64x64, 1/32 scan)
#define R1_PIN  4
#define G1_PIN  5
#define B1_PIN  6
#define R2_PIN  7
#define G2_PIN  15
#define B2_PIN  16
#define A_PIN   18
#define B_PIN   8
#define C_PIN   17
#define D_PIN   42
#define E_PIN   9
#define CLK_PIN 41
#define LAT_PIN 40
#define OE_PIN  2

#define PANEL_WIDTH  64
#define PANEL_HEIGHT 64
#define PANEL_CHAIN  1

static const char *DEVICE_NAME = "SuperPuzzle";
static const char *SERVICE_UUID = "7D2F0001-6F0A-4B59-A7E1-2F5C4F4C4544";
static const char *GUIDE_CHARACTERISTIC_UUID = "7D2F0002-6F0A-4B59-A7E1-2F5C4F4C4544";

// 高速协议：只传 4096 个灯位的开/关 bitmap（512 bytes）+ 一个 RGB565 颜色。
// 0x20 BEGIN: [cmd][frame id u16][color u16]
// 0x21 DATA : [cmd][frame id u16][offset u16][bitmap bytes...]
// 0x22 SHOW : [cmd][frame id u16]
static constexpr size_t BITMAP_BYTES = PANEL_WIDTH * PANEL_HEIGHT / 8;
static constexpr uint8_t CMD_GUIDE_BEGIN = 0x20;
static constexpr uint8_t CMD_GUIDE_DATA  = 0x21;
static constexpr uint8_t CMD_GUIDE_SHOW  = 0x22;

MatrixPanel_I2S_DMA *display = nullptr;
BLEServer *bleServer = nullptr;

static uint8_t receiveBitmap[BITMAP_BYTES];
static uint8_t pendingBitmap[BITMAP_BYTES];
static uint8_t currentBitmap[BITMAP_BYTES];
static uint16_t receiveColor = 0;
static uint16_t pendingColor = 0;
static uint16_t currentColor = 0;
static uint16_t receivingFrameID = 0;
static bool receivingGuide = false;
static volatile bool guideReady = false;
static portMUX_TYPE guideMux = portMUX_INITIALIZER_UNLOCKED;

static uint16_t readLE16(const uint8_t *data) {
  return static_cast<uint16_t>(data[0]) |
         (static_cast<uint16_t>(data[1]) << 8);
}

class GuideCharacteristicCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    const size_t length = characteristic->getLength();
    uint8_t *data = characteristic->getData();
    if (data == nullptr || length < 1) return;

    const uint8_t command = data[0];

    if (command == CMD_GUIDE_BEGIN) {
      if (length < 5) return;
      receivingFrameID = readLE16(data + 1);
      receiveColor = readLE16(data + 3);
      memset(receiveBitmap, 0, sizeof(receiveBitmap));
      receivingGuide = true;
      return;
    }

    if (command == CMD_GUIDE_DATA) {
      if (!receivingGuide || length < 6) return;
      const uint16_t frameID = readLE16(data + 1);
      const uint16_t offset = readLE16(data + 3);
      if (frameID != receivingFrameID) return;

      const size_t payloadLength = length - 5;
      if (static_cast<size_t>(offset) + payloadLength > BITMAP_BYTES) return;
      memcpy(receiveBitmap + offset, data + 5, payloadLength);
      return;
    }

    if (command == CMD_GUIDE_SHOW) {
      if (!receivingGuide || length < 3) return;
      const uint16_t frameID = readLE16(data + 1);
      if (frameID != receivingFrameID) return;

      portENTER_CRITICAL(&guideMux);
      memcpy(pendingBitmap, receiveBitmap, sizeof(pendingBitmap));
      pendingColor = receiveColor;
      guideReady = true;
      portEXIT_CRITICAL(&guideMux);

      receivingGuide = false;
    }
  }
};

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    Serial.println("iPhone connected");
  }

  void onConnect(BLEServer *server, esp_ble_gatts_cb_param_t *param) override {
    // 尝试使用 7.5~15ms 的 BLE connection interval，iOS 会在允许范围内协商。
    server->updateConnParams(param->connect.remote_bda, 6, 12, 0, 400);
    Serial.println("iPhone connected (fast interval requested)");
  }

  void onDisconnect(BLEServer *server) override {
    Serial.println("iPhone disconnected");
    BLEDevice::startAdvertising();
  }
};

static void renderPendingGuide() {
  if (!guideReady || display == nullptr) return;

  uint8_t nextBitmap[BITMAP_BYTES];
  uint16_t nextColor;

  portENTER_CRITICAL(&guideMux);
  if (!guideReady) {
    portEXIT_CRITICAL(&guideMux);
    return;
  }
  memcpy(nextBitmap, pendingBitmap, sizeof(nextBitmap));
  nextColor = pendingColor;
  guideReady = false;
  portEXIT_CRITICAL(&guideMux);

  const bool colorChanged = nextColor != currentColor;

  if (colorChanged) {
    // 换色时直接清屏，再只画需要亮的点，比逐个重画 4096 点快很多。
    display->clearScreen();
    if (nextColor != 0) {
      for (size_t byteIndex = 0; byteIndex < BITMAP_BYTES; ++byteIndex) {
        uint8_t bits = nextBitmap[byteIndex];
        while (bits) {
          const uint8_t bit = __builtin_ctz(static_cast<unsigned int>(bits));
          const size_t pixelIndex = byteIndex * 8 + bit;
          display->drawPixel(pixelIndex % PANEL_WIDTH, pixelIndex / PANEL_WIDTH, nextColor);
          bits &= static_cast<uint8_t>(bits - 1);
        }
      }
    }
  } else {
    // 同一个色号下标记/取消标记时，只更新真正发生变化的点。
    for (size_t byteIndex = 0; byteIndex < BITMAP_BYTES; ++byteIndex) {
      uint8_t changed = currentBitmap[byteIndex] ^ nextBitmap[byteIndex];
      while (changed) {
        const uint8_t bit = __builtin_ctz(static_cast<unsigned int>(changed));
        const size_t pixelIndex = byteIndex * 8 + bit;
        const bool on = (nextBitmap[byteIndex] & (1u << bit)) != 0;
        display->drawPixel(
          pixelIndex % PANEL_WIDTH,
          pixelIndex / PANEL_WIDTH,
          on ? nextColor : 0
        );
        changed &= static_cast<uint8_t>(changed - 1);
      }
    }
  }

  memcpy(currentBitmap, nextBitmap, sizeof(currentBitmap));
  currentColor = nextColor;
}

static bool setupMatrix() {
  HUB75_I2S_CFG::i2s_pins pins = {
    R1_PIN, G1_PIN, B1_PIN,
    R2_PIN, G2_PIN, B2_PIN,
    A_PIN, B_PIN, C_PIN, D_PIN, E_PIN,
    LAT_PIN, OE_PIN, CLK_PIN
  };

  HUB75_I2S_CFG config(PANEL_WIDTH, PANEL_HEIGHT, PANEL_CHAIN, pins);
  display = new MatrixPanel_I2S_DMA(config);
  if (!display->begin()) return false;

  display->setBrightness8(40);
  display->clearScreen();
  return true;
}

static void setupBluetooth() {
  BLEDevice::init(DEVICE_NAME);
  BLEDevice::setMTU(517);

  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());

  BLEService *service = bleServer->createService(SERVICE_UUID);
  BLECharacteristic *guideCharacteristic = service->createCharacteristic(
    GUIDE_CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  guideCharacteristic->setCallbacks(new GuideCharacteristicCallbacks());
  service->start();

  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->setMinPreferred(0x06);
  advertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.printf("Bluetooth ready: %s\n", DEVICE_NAME);
}

void setup() {
  Serial.begin(115200);
  delay(500);

  if (!setupMatrix()) {
    Serial.println("HUB75 matrix init failed");
    while (true) delay(1000);
  }

  memset(receiveBitmap, 0, sizeof(receiveBitmap));
  memset(pendingBitmap, 0, sizeof(pendingBitmap));
  memset(currentBitmap, 0, sizeof(currentBitmap));

  setupBluetooth();
  Serial.println("64x64 smart beading board ready");
}

void loop() {
  renderPendingGuide();
  delay(1);
}
