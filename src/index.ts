import express from "express";
import { createServer } from "http";
import { Server } from "colyseus";
import { monitor } from "@colyseus/monitor";
import { GameRoom } from "./rooms/GameRoom";

const port =
    Number(process.env.PORT || 2567) +
    Number(process.env.NODE_APP_INSTANCE || 0);
const app = express();

app.use(express.json());

app.use('/api', require('./routes'));

// Attach WebSocket Server on HTTP Server.
const gameServer = new Server({
    server: createServer(app),
    express: app,
    pingInterval: 0,
});

// register your room handlers
gameServer.define('game', GameRoom)
        .filterBy(['mode']);

// (optional) attach web monitoring panel
app.use("/colyseus", monitor());

gameServer.onShutdown(function () {
    console.log(`game server is going down.`);
});

gameServer.listen(port);

console.log(`Listening on ws://localhost:${port}`);
