import { createHash } from "crypto"
import { randomBytes } from "crypto"
import { BinaryWriter } from "./binary.js"

export const messageHandlers = []

let customIdLimit = parseInt(process.env.CUSTOM_ID_LIMIT)
let randomizeIds = process.env.RANDOM_IDS === "true"
messageHandlers.push(function(client, message) {
  let customIdValue = message.readVarlong()
  if (client.user) return
  let result = null
  if (randomizeIds) {
    result = randomBytes(15).toString("hex")
  } else {
    let thingToHash = `${process.env.ID_SALT}-${client.ip}`
    customIdChecks: if (customIdLimit > 1) {
      if (!(customIdValue > 0 && customIdValue <= customIdLimit)) break customIdChecks
      thingToHash += `-${customIdValue}`
    }
    let hash = createHash("sha256")
    hash.update(thingToHash)
    result = hash.digest("hex")
  }
  let id = result.substring(0, 24)
  let defaultColor = parseInt(result.substring(24, 30), 16)
  let user = client.server.getOrCreateUser(id, defaultColor)
  client.setUser(user)
  let response = new BinaryWriter()
  response.writeUInt8(0x00)
  response.writeVarlong(Date.now())
  response.writeBuffer(user.getInfo())
  client.sendBuffer(response.getBuffer())
})

messageHandlers.push(function(client, message) {
  let id = message.readString()
  let set
  set = {}
  set.visible = message.readBitflag(1)
  set.chat = message.readBitflag(2)
  set.crownsolo = message.readBitflag(3)
  set["no cussing"] = message.readBitflag(4)
  let hasColor2 = message.readBitflag(5)
  message.index++
  set.color = message.readColor()
  if (hasColor2) set.color2 = message.readColor()
  if (!client.user) return
  if (id.length > 512) return
  client.trySetChannel(id, set)
})

messageHandlers.push(function(client, message) {
  let response = new BinaryWriter()
  response.writeUInt8(0x02)
  response.writeVarlong(Date.now())
  client.sendBuffer(response.getBuffer())
})

messageHandlers.push(function(client, message) {
  let text = message.readString()
  if (!client.channel) return
  if (text.length > 512) return
  client.channel.sendChat(client.participant, text)
})

messageHandlers.push(function(client, message) {
  let startIndex = message.index
  let time = message.readVarlong()
  let count = message.readVarlong()
  let valid = true
  for (let i = count; i--;) {
    let noteId = message.readUInt8()
    if (noteId < 21 || noteId > 108) valid = false
    let velocity = message.readUInt8()
    if (velocity > 127 && velocity !== 255) valid = false
    message.readUInt8()
  }
  if (!valid) return
  if (!client.channel) return
  if (client.channel.settings.crownsolo && !client.participant.isOwner()) return
  let notesBuffer = message.buffer.slice(startIndex, message.index)
  client.channel.sendNotes(client.participant, notesBuffer)
})

messageHandlers.push(function(client, message) {
  let x = message.readUInt16()
  let y = message.readUInt16()
  if (!client.channel) return
  client.participant.setMousePos(x, y)
})

messageHandlers.push(function(client, message) {
  let nameChanged = message.readBitflag(0)
  let colorChanged = message.readBitflag(1)
  message.index++
  let name = nameChanged ? message.readString() : null
  let color = colorChanged ? message.readColor() : null
  if (!client.user) return
  client.user.setData(name, color)
})

messageHandlers.push(function(client, message) {
  let type = message.readUInt8()
  if (type !== 0x01) {
    let participant = type === 0x02 ? client.channel?.participantsById.get(message.readVarlong()) : client.participant
    if (!participant) return
    if (client.channel.type > 0) return
    if (client.channel.crown.userId === client.user.id) {
      //if we're in this block, the user is/was the crown holder
      //if the following condition is true, then the client is giving themself the crown when they already have it, which is pointless
      if (!client.channel.crown.dropped && participant === client.participant) return
    } else {
      //if the following is true, the client is trying to steal the crown
      if (!client.channel.crown.dropped) return
      //if the following is true, the client is picking up the crown too early
      if (Date.now() - client.channel.crown.time < 15000) return
    }
    client.channel.giveCrown(participant)
  } else {
    if (!client.channel) return
    if (client.channel.type > 0) return
    if (client.channel.crown.userId !== client.user.id) return
    client.channel.dropCrown(client.participant)
  }
})

messageHandlers.push(function(client, message) {
  let set = {}
  set.visible = message.readBitflag(1)
  set.chat = message.readBitflag(2)
  set.crownsolo = message.readBitflag(3)
  set["no cussing"] = message.readBitflag(4)
  let hasColor2 = message.readBitflag(5)
  message.index++
  set.color = message.readColor()
  if (hasColor2) set.color2 = message.readColor()
  if (!client.channel) return
  if (!client.participant.isOwner()) return
  client.channel.setSettings(set)
})

messageHandlers.push(function(client, message) {
  let id = message.readUserId()
  let target = client.server.users.get(id)
  let ms = message.readVarlong()
  if (!target) return
  if (client.channel.isBanned(id)) return
  if (ms > 36e5) return
  if (!client.channel) return
  if (!client.participant.isOwner()) return
  client.channel.ban(target, ms)
  client.channel.sendChat(client.participant, `Banned ${target.data.name} from the channel for ${Math.ceil(ms / 60000)} minutes.`)
})

messageHandlers.push(function(client, message) {
  let id = message.readUserId()
  if (!client.channel) return
  if (!client.participant.isOwner()) return
  let target = client.server.users.get(id)
  if (!target) return
  if (!client.channel.isBanned(id)) return
  client.channel.unban(id)
})

messageHandlers.push(function(client, message) {
  let actionId = message.readUInt8()
  if (!client.user) return
  if (actionId === 0x00) {
    if (client.channelListSubscribed) return
    client.channelListSubscribe() 
  } else {
    if (!client.channelListSubscribed) return
    client.channelListUnsubscribe()
  }
})