import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mercadopago from "mercadopago";

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(",") || "*" }));
app.use(express.json());

// Mercado Pago Access Token
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

app.post("/create_preference", async (req, res) => {
  try {
    const { title, quantity, unit_price, payer, metadata } = req.body;
    if (!title || !quantity || !unit_price) {
      return res.status(400).json({ error: "Faltan campos requeridos." });
    }

    const preference = {
      items: [
        { title, quantity, currency_id: "CLP", unit_price: Number(unit_price) }
      ],
      payer,
      metadata,
      back_urls: {
        success: `${process.env.FRONTEND_URL}/Paginas/pago-exitoso.html`,
        failure: `${process.env.FRONTEND_URL}/Paginas/pago-fallido.html`,
        pending: `${process.env.FRONTEND_URL}/Paginas/pago-pendiente.html`
      },
      auto_return: "approved"
    };

    const result = await mercadopago.preferences.create(preference);
    res.json({ init_point: result.body.init_point });
  } catch (err) {
    res.status(500).json({ error: "Error al crear la preferencia" });
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log(`Servidor MP en puerto ${process.env.PORT || 3000}`)
);
