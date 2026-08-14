const express = require('express')
const cors = require('cors');
const http = require('http')
const app = express()

app.use(cors())
const {Server} = require('socket.io')
const server = http.createServer(app)

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
})
const PORT = 8000

app.get("/", (req, res)=>{res.send("running")})

io.on("connection", (socket)=>{
    console.log("User connected: "+socket.id)

    socket.on("change_current_song", (data)=>{
        socket.broadcast.emit("update_current_song",data)
    })

    socket.on("pause", ()=>{
        socket.broadcast.emit("pause_song")
    })
    socket.on("play", ()=>{
        socket.broadcast.emit("play_song")
    })
})

server.listen(PORT, ()=>{console.log(`http://localhost:${PORT}`)})