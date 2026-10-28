import { beforeEach, expect, it, vi } from 'vitest'
const mock=vi.hoisted(()=>({getCurrentPages:vi.fn(),navigateBack:vi.fn(),redirectTo:vi.fn()}))
vi.mock('@tarojs/taro',()=>({default:mock}))
import { closeEditor } from '../src/platform/editorNavigation'
beforeEach(()=>{vi.resetAllMocks();mock.navigateBack.mockResolvedValue({});mock.redirectTo.mockResolvedValue({})})
it('returns to the existing source page instead of replacing it with works',async()=>{
 mock.getCurrentPages.mockReturnValue([{},{}])
 await closeEditor()
 expect(mock.navigateBack).toHaveBeenCalledWith({delta:1})
 expect(mock.redirectTo).not.toHaveBeenCalled()
})
it('uses works only for direct entry without a previous page',async()=>{
 mock.getCurrentPages.mockReturnValue([{}])
 await closeEditor()
 expect(mock.redirectTo).toHaveBeenCalledWith({url:'/pages/works/index'})
 expect(mock.navigateBack).not.toHaveBeenCalled()
})
it('ignores duplicate close taps during navigation',async()=>{
 mock.getCurrentPages.mockReturnValue([{},{}])
 let finish!:()=>void
 mock.navigateBack.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve}))
 const first=closeEditor()
 await closeEditor()
 expect(mock.navigateBack).toHaveBeenCalledTimes(1)
 finish();await first
})
it('does not redirect away from the source when back navigation fails',async()=>{
 mock.getCurrentPages.mockReturnValue([{},{}]);mock.navigateBack.mockRejectedValue(new Error('busy'))
 await expect(closeEditor()).rejects.toThrow('busy')
 expect(mock.redirectTo).not.toHaveBeenCalled()
 mock.navigateBack.mockResolvedValue({});await closeEditor()
 expect(mock.navigateBack).toHaveBeenCalledTimes(2)
})
