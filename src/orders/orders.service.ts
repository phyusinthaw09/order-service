import { Injectable } from "@nestjs/common";
import { joinUrl } from "../config/paths";
import { PaymentService } from "../payment/payment.service";
import { CreateOrderResult, Order, OrderItem, PaymentResult } from "./orders.types";

const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || "http://localhost:3002/inventory";

@Injectable()
export class OrdersService {
  private readonly orders: Order[] = [];
  private orderSequence = 1;

  constructor(private readonly paymentService: PaymentService) {}

  getOrders(): Order[] {
    return [...this.orders].reverse();
  }

  async createOrder(items: OrderItem[] | undefined): Promise<CreateOrderResult> {
    if (!Array.isArray(items) || items.length === 0) {
      return { error: "items array is required" };
    }

    const total = items.reduce((sum, item) => {
      const price = Number(item.price || 0);
      const qty = Number(item.qty || 0);
      return sum + price * qty;
    }, 0);

    const orderId = String(this.orderSequence++);

    const payment = await this.paymentService.authorize(orderId, total);
    if (!payment.approved) {
      const order = this.saveOrder(orderId, items, total, "failed", payment);
      return { order, error: payment.message };
    }

    const stockItems = items.map((item) => {
      const productId = Number(item.productId);
      return {
        productId: Number.isFinite(productId) ? productId : item.productId,
        qty: Number(item.qty || 0),
      };
    });

    let status: Order["status"] = "confirmed";
    let stockError: string | null = null;

    try {
      const stockRes = await fetch(joinUrl(INVENTORY_SERVICE_URL, "/reduce-stock"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: stockItems }),
      });

      if (!stockRes.ok) {
        const body = await this.readResponseJson(stockRes);
        status = "failed";
        stockError = body.error || "Stock reduction failed";
      }
    } catch {
      status = "failed";
      stockError = "inventory-service unreachable";
    }

    const order = this.saveOrder(orderId, items, total, status, payment);

    if (status === "failed") {
      return { order, error: stockError || "Stock reduction failed" };
    }

    return { order };
  }

  private saveOrder(
    id: string,
    items: OrderItem[],
    total: number,
    status: Order["status"],
    payment: PaymentResult,
  ): Order {
    const order = {
      id,
      items,
      total,
      status,
      payment,
      createdAt: new Date().toISOString(),
    };
    this.orders.push(order);
    return order;
  }

  private async readResponseJson(response: Response): Promise<{ error?: string }> {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }
}
