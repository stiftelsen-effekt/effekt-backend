import { expect } from "chai";
import { generateKeyPairSync, sign, KeyObject } from "crypto";
import express from "express";
import http from "http";
import { AddressInfo } from "net";
import request from "supertest";
import { createJwtCheck, getUnverifiedIssuer } from "../custom_modules/authorization/jwtIssuers";

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

const createToken = (privateKey: KeyObject, claims: object) => {
  const header = base64url({ alg: "RS256", typ: "JWT", kid: "test-key" });
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url({ iat: now, exp: now + 300, ...claims });
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey);
  return `${header}.${payload}.${signature.toString("base64url")}`;
};

describe("JWT issuer checks", function () {
  const audience = "https://data.example.org";
  const customDomainIssuer = "https://login.example.org/";
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const { privateKey: otherPrivateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

  let jwksServer: http.Server;
  let primaryIssuer: string;
  let app: express.Express;

  before(function (done) {
    const jwks = {
      keys: [{ ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256" }],
    };
    jwksServer = http.createServer((req, res) => {
      if (req.url === "/.well-known/jwks.json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(jwks));
      } else if (req.url === "/.well-known/openid-configuration") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            issuer: primaryIssuer,
            jwks_uri: `${primaryIssuer}.well-known/jwks.json`,
          }),
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    jwksServer.listen(0, "127.0.0.1", () => {
      primaryIssuer = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}/`;
      app = express();
      app.get(
        "/protected",
        createJwtCheck(audience, primaryIssuer, [customDomainIssuer]),
        (req, res) => res.json({ ok: true }),
      );
      done();
    });
  });

  after(function (done) {
    jwksServer.close(done);
  });

  const get = (token?: string) => {
    const req = request(app).get("/protected");
    return token ? req.set("Authorization", `Bearer ${token}`) : req;
  };

  it("accepts tokens from the primary issuer", async function () {
    await get(createToken(privateKey, { iss: primaryIssuer, aud: audience })).expect(200);
  });

  it("accepts tokens from an additional issuer signed with the tenant keys", async function () {
    await get(createToken(privateKey, { iss: customDomainIssuer, aud: audience })).expect(200);
  });

  it("rejects tokens from an unknown issuer", async function () {
    await get(createToken(privateKey, { iss: "https://evil.example.org/", aud: audience })).expect(
      401,
    );
  });

  it("rejects additional-issuer tokens signed with another key", async function () {
    await get(createToken(otherPrivateKey, { iss: customDomainIssuer, aud: audience })).expect(401);
  });

  it("rejects additional-issuer tokens for another audience", async function () {
    await get(
      createToken(privateKey, { iss: customDomainIssuer, aud: "https://other.example.org" }),
    ).expect(401);
  });

  it("rejects requests without a token", async function () {
    await get().expect(401);
  });

  it("reads the issuer only from well-formed bearer tokens", function () {
    const token = createToken(privateKey, { iss: customDomainIssuer });
    expect(getUnverifiedIssuer(`Bearer ${token}`)).to.equal(customDomainIssuer);
    expect(getUnverifiedIssuer(undefined)).to.equal(undefined);
    expect(getUnverifiedIssuer("Bearer not-a-jwt")).to.equal(undefined);
    expect(getUnverifiedIssuer("Basic abc.def.ghi")).to.equal(undefined);
  });
});
