import "dotenv/config"
import { Server } from "./Server.js"
import readline from "readline"
import { stdin, stdout } from "process"

//console input stuff
let rl = readline.createInterface({ input: stdin, output: stdout })
rl.on("line", async d => {
  let msg = d.toString().trim()
  try {
    console.log(eval(msg))
  } catch (e) {
    console.log(e.name + ": " + e.message + "\n" + e.stack)
  }
})
rl.on("SIGINT", async () => {
  console.log("Attempting graceful shutdown")
  //this saves user data to make sure everything is cleaned up properly
  await server.destroy()
  rl.close()
  process.exit()
})

let server = new Server()