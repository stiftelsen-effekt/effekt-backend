import { WebSocketServer, WebSocket } from "ws";
import { daoEvents, DonationConfirmedEvent } from "./custom_modules/daoEvents";
import { DAO } from "./custom_modules/DAO";
import { Server } from "http";

const subscriptions = new Map<number, Set<WebSocket>>();

export function startWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "subscribe" && msg.fundraiserId != null) {
          subscribe(ws, Number(msg.fundraiserId));
        }
      } catch {}
    });

    ws.on("close", () => {
      for (const [fundraiserId, sockets] of subscriptions) {
        sockets.delete(ws);
        if (sockets.size === 0) subscriptions.delete(fundraiserId);
      }
    });
  });

  daoEvents.on("donation:confirmed", async (data: DonationConfirmedEvent) => {
    const fundraiserInfo = await DAO.fundraisers.getFundraiserTransactionByKID(data.KID);
    if (!fundraiserInfo) return;

    const sockets = subscriptions.get(fundraiserInfo.fundraiserId);
    if (!sockets || sockets.size === 0) return;

    const message = JSON.stringify({
      type: "donation",
      fundraiserId: fundraiserInfo.fundraiserId,
      transaction: {
        id: fundraiserInfo.transactionId,
        name: fundraiserInfo.name,
        message: fundraiserInfo.message,
        amount: data.amount,
        date:
          data.timestamp instanceof Date
            ? data.timestamp.toISOString()
            : data.timestamp || new Date().toISOString(),
      },
    });

    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    }
  });

  console.log("WebSocket server attached to HTTP server");
}

function subscribe(ws: WebSocket, fundraiserId: number) {
  if (!subscriptions.has(fundraiserId)) {
    subscriptions.set(fundraiserId, new Set());
  }
  subscriptions.get(fundraiserId)!.add(ws);
}
