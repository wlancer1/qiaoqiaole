import CoreBluetooth
import Foundation
import SwiftUI

struct LEDMatrixBoardDevice: Identifiable {
    let id: UUID
    let name: String
    fileprivate let peripheral: CBPeripheral
}

final class LEDMatrixBluetoothController: NSObject, ObservableObject {
    static let serviceUUID = CBUUID(string: "7D2F0001-6F0A-4B59-A7E1-2F5C4F4C4544")
    static let frameCharacteristicUUID = CBUUID(string: "7D2F0002-6F0A-4B59-A7E1-2F5C4F4C4544")

    enum ConnectionState: Equatable {
        case idle
        case unavailable(String)
        case scanning
        case connecting(String)
        case connected(String)
        case failed(String)

        var label: String {
            switch self {
            case .idle: return "未连接"
            case .unavailable(let message): return message
            case .scanning: return "正在搜索智能拼豆板…"
            case .connecting: return "正在连接智能拼豆板…"
            case .connected: return "智能拼豆板已连接"
            case .failed(let message): return message
            }
        }
    }

    @Published private(set) var state: ConnectionState = .idle
    @Published private(set) var devices: [LEDMatrixBoardDevice] = []
    @Published private(set) var isTransmitting = false

    var isReady: Bool {
        writeCharacteristic != nil && connectedPeripheral?.state == .connected
    }

    private struct GuidePayload {
        let color: UInt16
        let bitmap: Data
    }

    private var central: CBCentralManager!
    private var connectedPeripheral: CBPeripheral?
    private var writeCharacteristic: CBCharacteristic?
    private var pendingPackets: [Data] = []
    private var queuedGuide: GuidePayload?
    private var nextFrameID: UInt16 = 1

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
    }

    func startScanning() {
        guard central.state == .poweredOn else {
            updateStateForBluetoothPower()
            return
        }
        guard !isReady else { return }
        devices = []
        state = .scanning
        central.scanForPeripherals(
            withServices: [Self.serviceUUID],
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
    }

    func stopScanning() {
        central.stopScan()
        if case .scanning = state { state = .idle }
    }

    func connect(_ device: LEDMatrixBoardDevice) {
        central.stopScan()
        if let connectedPeripheral, connectedPeripheral.identifier != device.id {
            central.cancelPeripheralConnection(connectedPeripheral)
        }
        resetTransport(keepQueuedFrame: false)
        connectedPeripheral = device.peripheral
        device.peripheral.delegate = self
        state = .connecting(device.name)
        central.connect(device.peripheral)
    }

    func disconnect() {
        central.stopScan()
        resetTransport(keepQueuedFrame: false)
        if let connectedPeripheral {
            central.cancelPeripheralConnection(connectedPeripheral)
        }
        connectedPeripheral = nil
        writeCharacteristic = nil
        state = .idle
    }

    /// 只发送“当前色号 + 64×64 开关位图”。
    /// 64×64 共 4096 个格子，只需要 512 bytes，而不是整张 RGB565 的 8192 bytes。
    func sendGuide(
        columns: Int,
        rows: Int,
        cells: [BeadCell],
        highlightedColorCode: String?,
        markedIndexes: Set<Int>
    ) {
        guard isReady else { return }
        guard let highlightedColorCode else {
            clearBoard()
            return
        }
        enqueue(guide: Self.makeGuidePayload(
            columns: columns,
            rows: rows,
            cells: cells,
            highlightedColorCode: highlightedColorCode,
            markedIndexes: markedIndexes
        ))
    }

    func clearBoard() {
        guard isReady else { return }
        enqueue(guide: GuidePayload(color: 0, bitmap: Data(repeating: 0, count: 64 * 64 / 8)))
    }

    /// 退出/放弃拼豆时优先熄灭智能拼豆板。
    /// BEGIN 会把接收位图清零，所以这里只需发送 BEGIN + SHOW，
    /// 不必再传 512 bytes 空位图。
    func clearBoardImmediately() {
        guard isReady,
              let characteristic = writeCharacteristic else { return }

        pendingPackets.removeAll()
        queuedGuide = nil
        isTransmitting = false

        let frameID = nextFrameID
        nextFrameID &+= 1
        if nextFrameID == 0 { nextFrameID = 1 }

        var begin = Data([0x20])
        begin.appendLE(frameID)
        begin.appendLE(UInt16(0))

        var show = Data([0x22])
        show.appendLE(frameID)

        pendingPackets = [begin, show]
        isTransmitting = true
        pumpWrites(characteristic: characteristic)
    }

    private func enqueue(guide: GuidePayload) {
        guard guide.bitmap.count == 64 * 64 / 8 else { return }
        if isTransmitting || !pendingPackets.isEmpty {
            // 用户快速切换色号时，只保留最新状态，避免旧状态排队导致“追帧”。
            queuedGuide = guide
            return
        }
        beginTransmission(guide)
    }

    private func beginTransmission(_ guide: GuidePayload) {
        guard let peripheral = connectedPeripheral, let characteristic = writeCharacteristic else { return }
        let frameID = nextFrameID
        nextFrameID &+= 1
        if nextFrameID == 0 { nextFrameID = 1 }

        let maxWrite = max(20, peripheral.maximumWriteValueLength(for: .withoutResponse))
        let chunkPayloadSize = max(1, maxWrite - 5)

        // 0x20: [cmd][frame id u16][color rgb565 u16]
        var begin = Data([0x20])
        begin.appendLE(frameID)
        begin.appendLE(guide.color)

        // 0x21: [cmd][frame id u16][bitmap offset u16][bitmap bytes...]
        var packets: [Data] = [begin]
        packets.reserveCapacity(2 + Int(ceil(Double(guide.bitmap.count) / Double(chunkPayloadSize))))
        var offset = 0
        while offset < guide.bitmap.count {
            let count = min(chunkPayloadSize, guide.bitmap.count - offset)
            var packet = Data([0x21])
            packet.appendLE(frameID)
            packet.appendLE(UInt16(offset))
            packet.append(guide.bitmap.subdata(in: offset..<(offset + count)))
            packets.append(packet)
            offset += count
        }

        // 0x22: [cmd][frame id u16]
        var show = Data([0x22])
        show.appendLE(frameID)
        packets.append(show)

        pendingPackets = packets
        isTransmitting = true
        pumpWrites(characteristic: characteristic)
    }

    private func pumpWrites(characteristic: CBCharacteristic? = nil) {
        guard let peripheral = connectedPeripheral,
              let target = characteristic ?? writeCharacteristic,
              peripheral.state == .connected else {
            isTransmitting = false
            return
        }

        while !pendingPackets.isEmpty && peripheral.canSendWriteWithoutResponse {
            let packet = pendingPackets.removeFirst()
            peripheral.writeValue(packet, for: target, type: .withoutResponse)
        }

        guard pendingPackets.isEmpty else { return }

        isTransmitting = false
        if let queuedGuide {
            self.queuedGuide = nil
            beginTransmission(queuedGuide)
        }
    }

    private func resetTransport(keepQueuedFrame: Bool) {
        pendingPackets.removeAll()
        isTransmitting = false
        if !keepQueuedFrame { queuedGuide = nil }
    }

    private func updateStateForBluetoothPower() {
        switch central.state {
        case .poweredOn:
            if !isReady { state = .idle }
        case .poweredOff:
            state = .unavailable("请先打开 iPhone 蓝牙")
        case .unauthorized:
            state = .unavailable("请在系统设置中允许超级拼使用蓝牙")
        case .unsupported:
            state = .unavailable("当前设备不支持蓝牙 BLE")
        case .resetting:
            state = .unavailable("蓝牙正在重置")
        case .unknown:
            state = .unavailable("正在初始化蓝牙…")
        @unknown default:
            state = .unavailable("蓝牙状态不可用")
        }
    }

    private static func makeGuidePayload(
        columns: Int,
        rows: Int,
        cells: [BeadCell],
        highlightedColorCode: String,
        markedIndexes: Set<Int>
    ) -> GuidePayload {
        let boardSide = 64
        var bitmap = Data(repeating: 0, count: boardSide * boardSide / 8)
        let guideColor: UInt16 = 0xFFFF // 智能拼豆板统一使用白光，避免图纸颜色与灯珠显示产生色差。
        guard columns > 0, rows > 0 else { return GuidePayload(color: guideColor, bitmap: bitmap) }

        let originX = (boardSide - columns) / 2
        let originY = (boardSide - rows) / 2

        for (index, cell) in cells.enumerated() {
            guard index < columns * rows,
                  cell.color != Palette.empty,
                  cell.color.code == highlightedColorCode,
                  !markedIndexes.contains(index) else { continue }

            let sourceX = index % columns
            let sourceY = index / columns
            let x = sourceX + originX
            let y = sourceY + originY
            guard x >= 0, x < boardSide, y >= 0, y < boardSide else { continue }

            let pixelIndex = y * boardSide + x
            let byteIndex = pixelIndex >> 3
            let bitMask = UInt8(1 << (pixelIndex & 7))
            bitmap[byteIndex] |= bitMask
        }

        return GuidePayload(color: guideColor, bitmap: bitmap)
    }
}

extension LEDMatrixBluetoothController: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        updateStateForBluetoothPower()
    }

    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let name = "智能拼豆板"
        guard !devices.contains(where: { $0.id == peripheral.identifier }) else { return }
        devices.append(LEDMatrixBoardDevice(id: peripheral.identifier, name: name, peripheral: peripheral))
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.delegate = self
        peripheral.discoverServices([Self.serviceUUID])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        writeCharacteristic = nil
        resetTransport(keepQueuedFrame: false)
        state = .failed(error?.localizedDescription ?? "智能拼豆板连接失败")
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        writeCharacteristic = nil
        resetTransport(keepQueuedFrame: false)
        if connectedPeripheral?.identifier == peripheral.identifier {
            connectedPeripheral = nil
        }
        state = error == nil ? .idle : .failed(error?.localizedDescription ?? "智能拼豆板连接已断开")
    }
}

extension LEDMatrixBluetoothController: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error {
            state = .failed(error.localizedDescription)
            return
        }
        guard let service = peripheral.services?.first(where: { $0.uuid == Self.serviceUUID }) else {
            state = .failed("未找到智能拼豆板 BLE 服务")
            return
        }
        peripheral.discoverCharacteristics([Self.frameCharacteristicUUID], for: service)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let error {
            state = .failed(error.localizedDescription)
            return
        }
        guard let characteristic = service.characteristics?.first(where: { $0.uuid == Self.frameCharacteristicUUID }) else {
            state = .failed("未找到智能拼豆板数据通道")
            return
        }
        writeCharacteristic = characteristic
        state = .connected("智能拼豆板")
    }

    func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
        pumpWrites()
    }
}

private extension Data {
    mutating func appendLE(_ value: UInt16) {
        append(UInt8(value & 0x00FF))
        append(UInt8((value >> 8) & 0x00FF))
    }
}

struct LEDMatrixBluetoothSheet: View {
    @ObservedObject var controller: LEDMatrixBluetoothController
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    VStack(spacing: 12) {
                        Image("SmartBeadingBoardLogo")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 72, height: 72)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .shadow(color: Color.black.opacity(0.08), radius: 10, y: 4)

                        VStack(spacing: 5) {
                            Text("智能拼豆板")
                                .font(.title2.bold())
                                .foregroundStyle(AppTokens.flowText)
                            Text("连接后，当前色号的拼豆位置会自动同步点亮")
                                .font(.subheadline)
                                .foregroundStyle(AppTokens.muted)
                                .multilineTextAlignment(.center)
                        }
                    }
                    .padding(.top, 8)

                    HStack(spacing: 12) {
                        ZStack {
                            Circle()
                                .fill(controller.isReady ? Color.green.opacity(0.12) : AppTokens.flowBrand.opacity(0.10))
                                .frame(width: 42, height: 42)
                            Image(systemName: controller.isReady ? "checkmark" : "antenna.radiowaves.left.and.right")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(controller.isReady ? Color.green : AppTokens.flowBrand)
                        }

                        VStack(alignment: .leading, spacing: 4) {
                            Text(controller.state.label)
                                .font(.headline)
                                .foregroundStyle(AppTokens.flowText)
                            Text(controller.isReady
                                 ? "已连接。选择色号后会点亮对应位置，完成当前色后自动进入下一色。"
                                 : "请打开智能拼豆板电源并靠近手机，发现后点击即可连接。")
                                .font(.caption)
                                .foregroundStyle(AppTokens.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(16)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(AppTokens.flowLine, lineWidth: 1))

                    if controller.isReady {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("已连接")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(AppTokens.muted)

                            HStack(spacing: 12) {
                                Image("SmartBeadingBoardLogo")
                                    .resizable()
                                    .scaledToFit()
                                    .frame(width: 42, height: 42)
                                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                                VStack(alignment: .leading, spacing: 3) {
                                    Text("智能拼豆板")
                                        .font(.headline)
                                        .foregroundStyle(AppTokens.flowText)
                                    Text("已准备好，可以开始拼豆")
                                        .font(.caption)
                                        .foregroundStyle(AppTokens.muted)
                                }
                                Spacer()
                            }
                            .padding(14)
                            .background(Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(AppTokens.flowLine, lineWidth: 1))

                            Button(role: .destructive) {
                                controller.disconnect()
                            } label: {
                                Text("断开连接")
                                    .font(.headline)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 13)
                            }
                            .buttonStyle(.bordered)
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text("可连接设备")
                                    .font(.headline)
                                    .foregroundStyle(AppTokens.flowText)
                                Spacer()
                                if case .scanning = controller.state {
                                    ProgressView()
                                        .controlSize(.small)
                                }
                            }

                            if controller.devices.isEmpty {
                                VStack(spacing: 9) {
                                    Image(systemName: "dot.radiowaves.left.and.right")
                                        .font(.system(size: 26))
                                        .foregroundStyle(AppTokens.muted)
                                    Text("正在查找附近的智能拼豆板")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(AppTokens.flowText)
                                    Text("保持设备通电并靠近手机，通常几秒内即可发现。")
                                        .font(.caption)
                                        .foregroundStyle(AppTokens.muted)
                                        .multilineTextAlignment(.center)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 24)
                                .background(Color.white)
                                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(AppTokens.flowLine, lineWidth: 1))
                            } else {
                                ForEach(controller.devices) { device in
                                    Button {
                                        controller.connect(device)
                                    } label: {
                                        HStack(spacing: 12) {
                                            Image("SmartBeadingBoardLogo")
                                                .resizable()
                                                .scaledToFit()
                                                .frame(width: 42, height: 42)
                                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                                            VStack(alignment: .leading, spacing: 3) {
                                                Text("智能拼豆板")
                                                    .font(.headline)
                                                    .foregroundStyle(AppTokens.flowText)
                                                Text("点击连接")
                                                    .font(.caption)
                                                    .foregroundStyle(AppTokens.muted)
                                            }
                                            Spacer()
                                            Image(systemName: "chevron.right")
                                                .font(.caption.weight(.semibold))
                                                .foregroundStyle(AppTokens.muted)
                                        }
                                        .padding(14)
                                        .background(Color.white)
                                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(AppTokens.flowLine, lineWidth: 1))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .background(AppTokens.flowBackground)
            .navigationTitle("连接智能拼豆板")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("关闭") { dismiss() }
                }
                if !controller.isReady {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("重新搜索") { controller.startScanning() }
                    }
                }
            }
        }
        .onAppear {
            if !controller.isReady { controller.startScanning() }
        }
        .onDisappear { controller.stopScanning() }
    }
}
