import express from "express";
import fetch from "node-fetch";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

const server = createServer(app);

const wss = new WebSocketServer({ server });

let connectedClients = [];

wss.on("connection", (ws) => {
  console.log("New client connected");
  connectedClients.push(ws);

  ws.on("close", () => {
    console.log("Client disconnected");
    connectedClients = connectedClients.filter((client) => client !== ws);
  });
});

const checkAndCreateWebhook = async () => {
  const siteId = process.env.SITE_ID;
  console.log(siteId);
  const webhookUrl = process.env.WEBHOOK_URL;
  const triggerType = "form_submission";
  const formName = process.env.FORM_NAME;

  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Bearer ${process.env.WEBFLOW_TOKEN}`,
  };

  try {
    const response = await fetch(
      `https://api.webflow.com/sites/${siteId}/webhooks`,
      { headers }
    );
    const data = await response.json();

    const existingWebhook = data?.webhooks?.find(
      (webhook) =>
        webhook.triggerType === triggerType &&
        webhook.url === webhookUrl &&
        webhook.filter &&
        webhook.filter.name === formName
    );

    if (existingWebhook) {
      console.log("Webhook already exists:", existingWebhook);
    } else {
      const options = {
        method: "POST",
        headers,
        body: JSON.stringify({
          filter: { name: formName },
          triggerType: triggerType,
          url: webhookUrl,
        }),
      };

      const createResponse = await fetch(
        `https://api.webflow.com/sites/${siteId}/webhooks`,
        options
      );
      const createData = await createResponse.json();
      console.log("Webhook created:", createData);
    }
  } catch (error) {
    console.error("Error checking or creating webhook:", error);
  }
};

checkAndCreateWebhook();

app.post("/", async (req, res) => {
  console.log("Получены данные из вебхука:", JSON.stringify(req.body, null, 2));

  const formData = req.body.payload.data;
  console.log("Данные формы:", JSON.stringify(formData, null, 2));

  const scoreUrl = "https://api2.usemellow.com/process";
  const optionsScore = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        email: formData.leadEmail,
        name: "empty name",
        role: formData.leadRole,
        team_size: formData.leadTeamSize,
        country: formData.leadCountry,
      },
    }),
  };

  try {
    const responseScore = await fetch(scoreUrl, optionsScore);
    if (!responseScore.ok) {
      throw new Error(`Error: ${responseScore.status}`);
    }

    const resData = await responseScore.json();
    console.log(
      "Получены данные из score API:",
      JSON.stringify(resData, null, 2)
    );

    const combinedData = {
      ...formData,
      score: resData.score,
      self_service: resData.self_service,
    };

    console.log(
      "Объединенные данные для HubSpot:",
      JSON.stringify(combinedData, null, 2)
    );

    // add hubspot logic
    const hubsopotUrl = process.env.HUBSPOT_URL;

    const hubspotUrl = hubsopotUrl;
    const hubspotOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`,
      },
      body: JSON.stringify({
        properties: {
          email: String(formData.leadEmail),
          firstname: String(formData.leadFirstName || "NoName"),
          company_size: String(formData.leadTeamSize),
          custom_source: String(formData.leadSource || "Website"),
          contact_role: String(formData.leadRole),
          phone: String(formData.leadPhone || "NoPhone"),
          ga_id: String(formData.leadGAID || "NoGAID"),
          country: String(formData.leadCountry),
          utm_campaign: String(formData.leadUtmCampaign || "NoCampaign"),
          utm_content: String(formData.leadUtmContent || "NoContent"),
          utm_medium: String(formData.leadUtmMedium || "NoMedium"),
          utm_source: String(formData.leadUtmSource || "NoSource"),
          utm_term: String(formData.leadUtmTerm || "NoTerm"),
          custom_score: combinedData.score
        },
      }),
    };

    const hubspotResponse = await fetch(hubspotUrl, hubspotOptions);
    if (!hubspotResponse.ok) {
      throw new Error(
        `Error sending data to HubSpot: ${hubspotResponse.status}`
      );
    }

    const hubspotResData = await hubspotResponse.json();
    console.log("Ответ от HubSpot:", JSON.stringify(hubspotResData, null, 2));

    setTimeout(() => {
      connectedClients.forEach((client) => {
        client.send(
          JSON.stringify({
            score: resData.score,
            self_service: resData.self_service,
          })
        );
      });
    }, 2000);
  } catch (err) {
    console.log(err);
  }
  res.send("Запрос с клиента получен, обработан и вернулся результат");
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
