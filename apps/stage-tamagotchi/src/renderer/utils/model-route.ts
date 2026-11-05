import type { LlmRequestRoute, LlmRouteInput } from '@proj-airi/stage-ui/stores/ai/chat-llm/llm'

type Conversation = LlmRouteInput['conversation']
type Turn = Conversation['turns'][number]
type UserTurn = Extract<Turn, { type: 'user' }>

/**
 * Words that ask for work on the computer or for live data, so the request needs tools.
 * The list is wide on purpose: a command sent to the chat model fails without tools, while small talk sent
 * to the tool model only sounds a bit plainer.
 */
const COMMAND_PATTERN = new RegExp([
  'เปิด',
  'ปิด',
  'รัน',
  'ลบ',
  'ค้นหา',
  'ค้น',
  'หาไฟล์',
  'หาโฟลเดอร์',
  'จำไว้',
  'ช่วยจำ',
  'ลืม',
  'โหมดเกม',
  'โหมดเล่นเกม',
  'แรม',
  'ซีพียู',
  'จีพียู',
  'การ์ดจอ',
  'ดิสก์',
  'ไดรฟ์',
  'พื้นที่ว่าง',
  'ความจุ',
  'โปรแกรม',
  'แอป',
  'ไฟล์',
  'โฟลเดอร์',
  'หน้าต่าง',
  'เว็บ',
  'ยูทูบ',
  'ยูทูป',
  'กูเกิ',
  'เพลง',
  'คลิป',
  'กี่โมง',
  'วันที่เท่าไหร่',
  'สภาพอากาศ',
  'ฝนตก',
  'อุณหภูมิ',
  'เครื่องช้า',
  'เครื่องค้าง',
  'คอม',
  'หน้าจอ',
  'เทอร์มินัล',
  'ติดตั้ง',
  'ดาวน์โหลด',
  '\\bram\\b',
  '\\bcpu\\b',
  '\\bgpu\\b',
  'youtube',
  'google',
  'screenshot',
  'terminal',
].join('|'), 'i')

/** Returns true when the text asks for computer work or live data. */
export function looksLikeComputerCommand(text: string): boolean {
  return COMMAND_PATTERN.test(text)
}

function userText(turn: UserTurn) {
  return turn.content
    .map(segment => (segment.type === 'text' ? segment.text : ''))
    .join(' ')
    .trim()
}

/**
 * Picks the model for one request.
 *
 * A computer command goes to the tool model with tools. So does a reply right after a command, such as "ใช่"
 * after Shiro asked which app the user meant. Other small talk goes to the chat model without tools, because the
 * Thai chat model writes better Thai but misses tool calls.
 */
export function routeShiroRequest(conversation: Conversation, models: { toolModel: string, chatModel: string }): LlmRequestRoute {
  const userTurns = conversation.turns.filter((turn): turn is UserTurn => turn.type === 'user')
  const latest = userTurns.at(-1)
  const previous = userTurns.at(-2)
  const lastAssistant = conversation.turns.findLast(turn => turn.type === 'assistant')
  const assistantUsedTools = lastAssistant?.type === 'assistant'
    && lastAssistant.rounds.some(round => round.toolInvocations.length > 0)

  // A short reply after a command that Shiro answered with a question, not a tool call, continues that command.
  const answersCommandQuestion = previous !== undefined
    && looksLikeComputerCommand(userText(previous))
    && !assistantUsedTools
    && userText(latest ?? previous).length <= 20
  const needsTools = !latest || looksLikeComputerCommand(userText(latest)) || answersCommandQuestion
  return needsTools
    ? { model: models.toolModel, tools: true }
    : { model: models.chatModel, tools: false }
}
