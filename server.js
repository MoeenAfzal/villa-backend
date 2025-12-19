import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import paypal from "@paypal/checkout-server-sdk";
import cors from "cors";
dotenv.config();

const app = express();
app.use(cors());

// If you want to allow only your frontend:
app.use(cors({
    origin: "https://corum8-venue.web.app"
}));
app.use(bodyParser.json());

// PayPal Environment
let environment = new paypal.core.SandboxEnvironment(
    process.env.PAYPAL_CLIENT_ID,
    process.env.PAYPAL_CLIENT_SECRET
);
let client = new paypal.core.PayPalHttpClient(environment);

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
                    value: totalAmount,
                },
            },
        ],
        application_context: {
            return_url: `${process.env.CLIENT_URL}/payment-success`,
            cancel_url: `${process.env.CLIENT_URL}/payment-cancel`,
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
        console.error(err);
        res.status(500).send("Error creating PayPal order");
    }

});

// Payment Success API
app.post("/api/booking/payment-success", async (req, res) => {
    const { orderID, bookingData } = req.body;

    try {
        // Capture payment
        const request = new paypal.orders.OrdersCaptureRequest(orderID);
        request.requestBody({});
        const capture = await client.execute(request);

        if (capture.result.status === "COMPLETED") {
            // Send email to admin
            await transporter.sendMail({
                from: `"Hotel Booking" <${process.env.SMTP_USER}>`,
                to: process.env.ADMIN_EMAIL,
                subject: `New Booking from ${bookingData.email}`,
                text: JSON.stringify(bookingData, null, 2),
            });

            // Send email to user
            await transporter.sendMail({
                from: `"Hotel Booking" <${process.env.SMTP_USER}>`,
                to: bookingData.email,
                subject: `Booking Confirmation`,
                text: `Hi ${bookingData.email},\n\nYour booking has been confirmed!\n\nDetails: ${JSON.stringify(
                    bookingData,
                    null,
                    2
                )}`,
            });

            res.json({ message: "Payment successful and emails sent!" });
        } else {
            res.status(400).json({ message: "Payment not completed" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Payment capture failed");
    }
});
app.post("/api/booking/capture-payment/:orderId", async (req, res) => {
    try {
        const { orderId } = req.params;
        const request = new paypal.orders.OrdersCaptureRequest(orderId);
        request.requestBody({});
        const capture = await client.execute(request);
        res.json(capture.result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Capture failed" });
    }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
