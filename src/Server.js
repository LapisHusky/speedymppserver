import uWS from "uWebSockets.js"
import { saveAndClose } from "./data.js"
import { Client } from "./Client.js"
import { User } from "./User.js"
import { Channel } from "./Channel.js"
import { getIpFromHeader, arrayBufferToString, stringToArrayBuffer } from "./util.js"
import { BinaryWriter } from "./binary.js"

export class Server {
  constructor() {
    this.clients = new Set()
    this.users = new Map()
    this.channels = new Map()

    this.listenSocket = null
    this.wsServer = this.createServer()

    this.tickInterval = setInterval(this.tick.bind(this), 50)

    this.channelListTopic = stringToArrayBuffer("\x01")
    this.channelListMsgCache = null
    this.channelUpdates = new Set()

    this.participantIdCounter = 1 //zero is falsy
    
    this.destroyed = false
  }

  async destroy() {
    if (this.destroyed) return
    this.destroyed = true
    clearInterval(this.tickInterval)
    if (this.listenSocket) uWS.us_listen_socket_close(this.listenSocket)
    for (let client of this.clients) {
      client.destroy()
    }
    await saveAndClose()
  }

  createServer() {
    let server
    if (process.env.HTTPS === "true") {
      let options = {}
      if (process.env.CERT_FILE_NAME) options.cert_file_name = process.env.CERT_FILE_NAME
      if (process.env.DH_PARAMS_FILE_NAME) options.dh_params_file_name = process.env.DH_PARAMS_FILE_NAME
      if (process.env.KEY_FILE_NAME) options.key_file_name = process.env.KEY_FILE_NAME
      if (process.env.PASSPHRASE) options.passphrase = process.env.PASSPHRASE
      server = uWS.SSLApp(options)
    } else {
      server = uWS.App()
    }
    server.ws("/*", {
      maxPayloadLength: 1 << 20,
      maxBackpressure: 2 << 20,
      closeOnBackpressureLimit: true,
      idleTimeout: 60,
      sendPingsAutomatically: true,
      upgrade: async (res, req, context) => {
        try {
          //read headers
          let secWebSocketKey = req.getHeader("sec-websocket-key")
          let secWebSocketProtocol = req.getHeader("sec-websocket-protocol")
          let secWebSocketExtensions = req.getHeader("sec-websocket-extensions")
          let ip
          if (process.env.IS_PROXIED === "true") {
            ip = getIpFromHeader(req.getHeader(process.env.REAL_IP_HEADER))
          } else {
            ip = arrayBufferToString(res.getRemoteAddressAsText())
          }
          res.upgrade({
            ip,
            closed: false
          }, secWebSocketKey, secWebSocketProtocol, secWebSocketExtensions, context)
        } catch (error) {
          console.error(error)
        }
      },
      open: ws => {
        try {
          ws.client = this.createClient(ws)
        } catch (error) {
          console.error(error)
        }
      },
      message: (ws, message, isBinary) => {
        try {
          ws.client.handleMessage(message, isBinary)
        } catch (error) {
          if (error?.message === "Invalid buffer read") return
          console.error(error)
        }
      },
      close: (ws, code, message) => {
        try {
          ws.closed = true
          ws.client.destroy()
        } catch (error) {
          console.error(error)
        }
      }
    })
    server.any("/*", (res, req) => {
      res.writeStatus("400 Bad Request")
      res.end()
    })
    server.listen(parseInt(process.env.WS_PORT), listenSocket => {
      if (!listenSocket) {
        console.log(`Failed to listen on port ${process.env.WS_PORT}!`)
      }
      this.listenSocket = listenSocket
    })
    return server
  }

  tick() {
    for (let channel of this.channels.values()) {
      channel.tick()
    }
    this.channelListMsgCache = null
    if (this.channelUpdates.size > 0) {
      let writer = new BinaryWriter()
      writer.writeUInt8(0x05)
      writer.writeUInt8(0x01)
      writer.writeVarlong(this.channelUpdates.size)
      for (let channel of this.channelUpdates.values()) {
        writer.writeBuffer(channel.getInfo())
      }
      let message = writer.getBuffer()
      this.wsServer.publish(this.channelListTopic, message, true)

      this.channelUpdates = new Set()
    }
  }

  createClient(ws) {
    let client = new Client(this, ws)
    this.clients.add(client)
    return client
  }

  removeClient(client) {
    this.clients.delete(client)
  }

  getOrCreateUser(id, color) {
    if (this.users.has(id)) return this.users.get(id)
    let user = new User(this, id, color)
    this.users.set(id, user)
    return user
  }

  removeUser(user) {
    this.users.delete(user.id)
  }

  getOrCreateChannel(id, set, creatorId) {
    if (this.channels.has(id)) return this.channels.get(id)
    let channel = new Channel(this, id, set, creatorId)
    this.channels.set(id, channel)
    return channel
  }

  removeChannel(channel) {
    this.channels.delete(channel.id)
    this.channelUpdates.delete(channel)
  }

  getFullChannelListMsg() {
    if (this.channelListMsgCache) return this.channelListMsgCache
    let writer = new BinaryWriter()
    writer.writeUInt8(0x05)
    writer.writeUInt8(0x00)
    let visibleChannelInfos = []
    for (let channel of this.channels.values()) {
      if (!channel.settings.visible) continue
      visibleChannelInfos.push(channel.getInfo())
    }
    writer.writeVarlong(visibleChannelInfos.length)
    for (let buffer of visibleChannelInfos) {
      writer.writeBuffer(buffer)
    }
    let message = writer.getBuffer()
    this.channelListMsgCache = message
    return message
  }
}

//simple way to watch the server's performance
/*
let userUsage = process.cpuUsage().user
let systemUsage = process.cpuUsage().system
setInterval(() => {
  let newUserUsage = process.cpuUsage().user
  let userDiff = newUserUsage - userUsage
  userUsage = newUserUsage
  let newSystemUsage = process.cpuUsage().system
  let systemDiff = newSystemUsage - systemUsage
  systemUsage = newSystemUsage
  console.log(userDiff / 1000000, systemDiff / 1000000)
}, 1000)
*/