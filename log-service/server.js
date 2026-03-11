const http = require("http")
const { PassThrough } = require("stream")
const express = require("express")
const { WebSocketServer } = require("ws")
const Docker = require("dockerode")

const app = express()
const server = http.createServer(app)

const docker = new Docker({ socketPath: "/var/run/docker.sock" })

const CONTAINERS = ["fwds-backend", "fwds-ml"]
const WINDOW_SECONDS = 60

// Serve page at /logs
app.get("/logs", (req, res) => {
    res.send(`
    <html>
        <body>
            <h2>Container Logs</h2>
            <pre id="logs"></pre>

            <script>
                const ws = new WebSocket("ws://" + location.host + "/logs")

                ws.onmessage = (event) => {
                    const data = JSON.parse(event.data)
                    const el = document.getElementById("logs")

                    if(data.log){
                        el.textContent += "[" + data.container + "] " + data.log
                    }

                    if(data.error){
                        el.textContent += "[ERROR " + data.container + "] " + data.error + "\\n"
                    }
                }
            </script>
        </body>
    </html>
    `)
})


// WebSocket ONLY on /logs
const wss = new WebSocketServer({
    noServer: true
})

server.on("upgrade", (request, socket, head) => {
    if (request.url === "/logs") {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit("connection", ws, request)
        })
    } else {
        socket.destroy()
    }
})

wss.on("connection", (ws) => {

    const streams = []
    const since = Math.floor(Date.now() / 1000) - WINDOW_SECONDS

    for (const name of CONTAINERS) {

        const container = docker.getContainer(name)

        container.logs(
            { stdout: true, stderr: true, since, follow: true, timestamps: true },
            (err, stream) => {

                if (err) {
                    if (ws.readyState === ws.OPEN) {
                        ws.send(JSON.stringify({ container: name, error: err.message }))
                    }
                    return
                }

                streams.push(stream)

                const out = new PassThrough()
                docker.modem.demuxStream(stream, out, out)

                out.on("data", (chunk) => {
                    if (ws.readyState === ws.OPEN) {
                        ws.send(JSON.stringify({
                            container: name,
                            log: chunk.toString()
                        }))
                    }
                })

                stream.on("error", (e) => {
                    if (ws.readyState === ws.OPEN) {
                        ws.send(JSON.stringify({
                            container: name,
                            error: e.message
                        }))
                    }
                })
            }
        )
    }

    ws.on("close", () => {
        for (const stream of streams) {
            stream.destroy()
        }
    })
})

server.listen(3000, () => {
    console.log("log service running at http://localhost:3000/logs")
})