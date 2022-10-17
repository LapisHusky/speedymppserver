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
  let defaultColor = result.substring(24, 30)
  let user = client.server.getOrCreateUser(id, defaultColor)
  client.setUser(user)
  let response = new BinaryWriter()
  response.writeUInt8(0x00)
  response.writeVarlong(Math.round(performance.now()))
  response.writeBuffer(user.getInfo())
  client.sendBuffer(response.getBuffer())
})

messageHandlers.push(function(client, message) {
  let id = message.readString()
  let hasSet = message.readBitflag(0)
  message.index++
  let set
  if (hasSet) {
    set = {}
    set.visible = message.readBitflag(1)
    set.chat = message.readBitflag(2)
    set.crownsolo = message.readBitflag(3)
    set["no cussing"] = message.readBitflag(4)
    let hasColor2 = message.readBitflag(5)
    message.index++
    set.color = message.readColor()
    if (hasColor2) set.color2 = message.readColor()
  } else {
    set = null
  }
  if (!client.user) return
  if (id.length > 512) return
  client.trySetChannel(id, set)
})

messageHandlers.push(function(client, message) {
  let response = new BinaryWriter()
  response.writeUInt8(0x02)
  response.writeVarlong(Math.round(performance.now()))
  client.sendBuffer(response.getBuffer())
})

messageHandlers.push(function(client, message) {
  let text = message.readString()
  if (!client.channel) return
  if (text.length > 512) return
  client.channel.sendChat(client.participant, text)
})
/*
messageHandlers.n = function(client, message) {
  if (!client.channel) return
  if (client.channel.settings.crownsolo && client.participant.id !== client.channel.crown.participantId) return
  if (!Array.isArray(message.n)) return
  //a proper server would do some more validation here to make sure this is within a reasonable distance of Date.now(), otherwise someone could bypass a quota by building up a huge block of messages minutes in advance
  //all i do is check that it's an integer
  //the lack of checking reduces failed messages from bots which don't sync time properly
  if (typeof message.t !== "number") return
  //do enough note validation to keep clients from throwing errors
  for (let noteObj of message.n) {
    if (noteObj === null) return
  }
  let response = [{
    m: "n",
    t: message.t,
    p: client.participant.id,
    n: message.n
  }]
  client.channel.broadcastArrayToOthers(response, client)
}

messageHandlers.m = function(client, message) {
  if (!client.channel) return
  let x = parseFloat(message.x)
  let y = parseFloat(message.y)
  if (isNaN(x) || isNaN(y)) return
  client.participant.setMousePos(x, y)
}

messageHandlers.userset = function(client, message) {
  if (!client.user) return
  if (typeof message.set !== "object" || message.set === null) return
  let name = null
  if (typeof message.set.name === "string" && message.set.name.length <= 40) name = message.set.name
  let color = null
  if (typeof message.set.color === "string" && validateColor(message.set.color)) color = message.set.color
  client.user.setData(name, color)
}

messageHandlers.chown = function(client, message) {
  if (!client.channel) return
  if (client.channel.type > 0) return
  let isGiving = "id" in message
  if (isGiving) {
    if (client.channel.crown.userId === client.user.id) {
      //if we're in this block, the user is/was the crown holder
      //if the following condition is true, then the client is giving themself the crown when they already have it, which is pointless
      if (client.channel.crown.participantId === message.id) return
    } else {
      //if the following is true, the client is trying to steal the crown
      if (client.channel.crown.participantId) return
      //if the following is true, the client is picking up the crown too early
      if (Date.now() - client.channel.crown.time < 15000) return
    }
    let participant = client.channel.participantsById.get(message.id)
    if (!participant) return
    client.channel.giveCrown(participant)
  } else {
    //if we're in this block, the user is dropping the crown
    //if the following condition is true, the user isn't the crown holder so they can't drop it
    if (client.channel.crown.userId !== client.user.id) return
    //if the following is true, the crown isn't currently held by them, it's already dropped
    if (!client.channel.crown.participantId) return
    client.channel.dropCrown(client.participant)
  }
}

messageHandlers.chset = function(client, message) {
  if (!client.channel) return
  if (client.channel.type > 0) return
  if (client.channel.crown.participantId !== client.participant.id) return
  let messageSet = message.set
  if (typeof messageSet !== "object" || messageSet === null) return
  let set = {}
  let hasEffect = false
  if ("chat" in messageSet) {
    hasEffect = true
    set.chat = messageSet.chat === true
  }
  if ("visible" in messageSet) {
    hasEffect = true
    set.visible = messageSet.visible === true
  }
  if ("color" in messageSet && typeof messageSet.color === "string" && validateColor(messageSet.color)) {
    hasEffect = true
    set.color = messageSet.color
  }
  if ("color2" in messageSet && typeof messageSet.color2 === "string" && validateColor(messageSet.color2)) {
    hasEffect = true
    set.color2 = messageSet.color2
  }
  if ("crownsolo" in messageSet) {
    hasEffect = true
    set.crownsolo = messageSet.crownsolo === true
  }
  if ("no cussing" in messageSet) {
    hasEffect = true
    set["no cussing"] = messageSet["no cussing"] === true
  }
  if (!hasEffect) return
  client.channel.setSettings(set)
}

messageHandlers.kickban = function(client, message) {
  if (!client.channel) return
  if (client.channel.type > 0) return
  if (client.channel.crown.participantId !== client.participant.id) return
  if (typeof message._id !== "string") return
  let target = client.server.users.get(message._id)
  if (!target) return
  if (client.channel.isBanned(message._id)) return
  if (typeof message.ms !== "number") return
  if (!(message.ms >= 0 && message.ms <= 36e5)) return
  client.channel.ban(client.user, target, message.ms)
  client.channel.sendChat(client.participant, `Banned ${target.data.name} from the channel for ${Math.ceil(message.ms / 60000)} minutes.`)
}

messageHandlers["+ls"] = function(client, message) {
  if (!client.user) return
  if (client.channelListSubscribed) return
  client.channelListSubscribe()
}

messageHandlers["-ls"] = function(client, message) {
  if (!client.user) return
  if (!client.channelListSubscribed) return
  client.channelListUnsubscribe()
}*/