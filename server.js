import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import paypal from "@paypal/checkout-server-sdk";
import cors from "cors";
dotenv.config();

const app = express();
app.use(cors({
    origin: "https://corum8-venue.web.app",
    methods: ["GET", "POST"],
    credentials: true
}));

app.use(bodyParser.json());

// PayPal Environment sandbox and live 
// let environment = new paypal.core.SandboxEnvironment(
//     "id client",
//     "secrey keys "
// );
// let client = new paypal.core.PayPalHttpClient(environment);
const environment = new paypal.core.LiveEnvironment(
    "ARCyB1iJXgyjMTteFAX1AV0NPCvgn8urh62kaQ5ZBgw3OKz4oQmdeA7W7euaGCFCtZjPCsXGSvZob8YZ",
    "EI8xhQDs3Tgq87wskXi2QKRo1ZbQ53_m85fFyUGEUE0_k3Qa1frsxHo2whyCTkl4di1s6gv-Zx-OJh15"
);

const client = new paypal.core.PayPalHttpClient(environment);
// Nodemailer setup
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// Create Payment API
app.post("/api/booking/create-payment", async (req, res) => {
    const { totalAmount, bookingData } = req.body;

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
        intent: "CAPTURE",
        purchase_units: [
            {
                amount: {
                    currency_code: "USD",
                    value: Number(totalAmount).toFixed(2),

                },
            },
        ],
        application_context: {
            return_url: `https://corum8-venue.web.app/payment-success`,
            cancel_url: `https://corum8-venue.web.app/payment-cancel`,

        },
    });

    try {
        const order = await client.execute(request);

        // Send id and approval links to frontend
        res.json({
            id: order.result.id,
            links: order.result.links, // this is important
            status: order.result.status
        });
    } catch (err) {
        console.error("PayPal error:", err);
        if (err.statusCode) {
            console.error("Status:", err.statusCode);
            console.error("Details:", err.result);
        }
        res.status(500).json({
            message: "Error creating PayPal order",
            paypal: err.result || null
        });
    }


});

// Payment Success API
app.post("/api/booking/payment-success", async (req, res) => {
  const { orderID, bookingData } = req.body;

  console.log("Received request to capture payment");
  console.log("Order ID:", orderID);
  console.log("Booking Data:", bookingData);

  if (!orderID) {
    console.error("No orderID provided!");
    return res.status(400).json({ message: "Order ID is missing" });
  }

  try {
    // Capture the payment
    const request = new paypal.orders.OrdersCaptureRequest(orderID);
    request.requestBody({});

    const capture = await client.execute(request);
    console.log("PayPal capture result:", capture.result);

    if (capture.result.status === "COMPLETED") {
      console.log("Payment successfully captured!");
      return res.json({ message: "Payment successfully captured!", capture: capture.result });
    } else {
      console.warn("Payment capture not completed:", capture.result);
      return res.status(400).json({ message: "Payment not completed", capture: capture.result });
    }
  } catch (err) {
    console.error("Error capturing PayPal payment:", err);
    res.status(500).json({ message: "Payment capture failed", error: err });
  }
});

app.get('/api/calendar', async (req, res) => {
  const url = 'https://www.airbnb.com/calendar/ical/1544385860919253271.ics?t=33b8f4d615604e40b62c31781d8e2958&locale=en-GB';
  const response = await fetch(url);
  const data = await response.text(); // ICS is plain text
  res.send(data);
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
