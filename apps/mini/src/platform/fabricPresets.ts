import f0 from "../assets/fabrics/ivory.png"
import f1 from "../assets/fabrics/rose.png"
import f2 from "../assets/fabrics/sage.png"
import f3 from "../assets/fabrics/blue.png"
import f4 from "../assets/fabrics/rose-check.png"
import f5 from "../assets/fabrics/sage-check.png"
import f6 from "../assets/fabrics/blue-check.png"
import f7 from "../assets/fabrics/honey-check.png"
import f8 from "../assets/fabrics/rose-stripe.png"
import f9 from "../assets/fabrics/blue-stripe.png"
import f10 from "../assets/fabrics/sage-dot.png"
import f11 from "../assets/fabrics/rose-dot.png"
import f12 from "../assets/fabrics/blue-dot.png"
import f13 from "../assets/fabrics/rose-flower.png"
import f14 from "../assets/fabrics/sage-flower.png"
import f15 from "../assets/fabrics/blue-flower.png"
// Rasterized from the same H5 preset SVGs for native Canvas image support.
export const fabricPresets=[{...{"id":"preset:ivory","presetId":"ivory","name":"奶油米白","color":"#eee5d5","sampleWidthMm":64},image:f0},{...{"id":"preset:rose","presetId":"rose","name":"柔雾玫瑰","color":"#d6a0a0","sampleWidthMm":64},image:f1},{...{"id":"preset:sage","presetId":"sage","name":"鼠尾草绿","color":"#a4b29c","sampleWidthMm":64},image:f2},{...{"id":"preset:blue","presetId":"blue","name":"雾霾蓝","color":"#9cabbc","sampleWidthMm":64},image:f3},{...{"id":"preset:rose-check","presetId":"rose-check","name":"玫瑰小格","color":"#d6a0a0","sampleWidthMm":64},image:f4},{...{"id":"preset:sage-check","presetId":"sage-check","name":"绿意小格","color":"#a4b29c","sampleWidthMm":64},image:f5},{...{"id":"preset:blue-check","presetId":"blue-check","name":"蓝白格纹","color":"#9cabbc","sampleWidthMm":64},image:f6},{...{"id":"preset:honey-check","presetId":"honey-check","name":"蜂蜜格纹","color":"#d9bc81","sampleWidthMm":64},image:f7},{...{"id":"preset:rose-stripe","presetId":"rose-stripe","name":"奶油粉条纹","color":"#d6a0a0","sampleWidthMm":64},image:f8},{...{"id":"preset:blue-stripe","presetId":"blue-stripe","name":"海盐蓝条纹","color":"#9cabbc","sampleWidthMm":64},image:f9},{...{"id":"preset:sage-dot","presetId":"sage-dot","name":"绿底米白波点","color":"#a4b29c","sampleWidthMm":64},image:f10},{...{"id":"preset:rose-dot","presetId":"rose-dot","name":"玫瑰波点","color":"#d6a0a0","sampleWidthMm":64},image:f11},{...{"id":"preset:blue-dot","presetId":"blue-dot","name":"雾蓝波点","color":"#9cabbc","sampleWidthMm":64},image:f12},{...{"id":"preset:rose-flower","presetId":"rose-flower","name":"奶油小雏菊","color":"#e9d9cc","sampleWidthMm":64},image:f13},{...{"id":"preset:sage-flower","presetId":"sage-flower","name":"田园小碎花","color":"#c7d1bc","sampleWidthMm":64},image:f14},{...{"id":"preset:blue-flower","presetId":"blue-flower","name":"晴空小碎花","color":"#bfcedd","sampleWidthMm":64},image:f15}]
export const presetImage=(id?:string)=>fabricPresets.find(p=>p.presetId===id)?.image
