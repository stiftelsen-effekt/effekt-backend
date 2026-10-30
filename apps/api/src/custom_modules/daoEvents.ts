import { EventEmitter } from "events";
import Redis from "ioredis";

export type DonationConfirmedEvent = {
  donationId: number;
  KID: string;
  amount: number;
  timestamp: Date;
  donorId: number;
};

export const daoEvents = new EventEmitter();

const redisUrl = process.env.REDIS_URL;
let publisher: Redis | null = null;
let subscriber: Redis | null = null;

if (redisUrl) {
  publisher = new Redis(redisUrl);
  subscriber = new Redis(redisUrl);

  subscriber.subscribe("dao-events");
  subscriber.on("message", (channel, message) => {
    const { event, data } = JSON.parse(message);
    daoEvents.emit(event, data);
  });

  console.log("Redis pub/sub connected for DAO events");
}

export function publishEvent(event: string, data: any) {
  if (publisher) {
    publisher.publish("dao-events", JSON.stringify({ event, data }));
  } else {
    daoEvents.emit(event, data);
  }
}
