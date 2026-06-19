import { Injectable } from "@nestjs/common";
import { joinUrl } from "../config/paths";
import { PaymentResult } from "../orders/orders.types";

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || "http://localhost:3003/payment";

@Injectable()
export class PaymentService {
  async authorize(orderId: string, amount: number, currency = "USD"): Promise<PaymentResult> {
    let response: Response;

    try {
      response = await fetch(joinUrl(PAYMENT_SERVICE_URL, "/authorize"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, amount, currency }),
      });
    } catch {
      return {
        approved: false,
        transactionId: null,
        message: "payment-service unreachable",
      };
    }

    const body = await this.readResponseJson(response);

    if (!response.ok) {
      return {
        approved: false,
        transactionId: null,
        message: body.message || body.error || "Payment authorization failed",
      };
    }

    return {
      approved: Boolean(body.approved),
      transactionId: body.transactionId ?? null,
      message: body.message || (body.approved ? "Payment approved" : "Payment declined"),
    };
  }

  private async readResponseJson(response: Response): Promise<any> {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }
}
