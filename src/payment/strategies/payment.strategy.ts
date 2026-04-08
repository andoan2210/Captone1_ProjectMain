export interface PaymentStrategy {
  createPayment(data: {
    orderId: number;
    amount: number;
  }): Promise<{ payUrl: string }>;

  verifySignature(data: any): boolean;

  refund?(data: {
    orderId: number;
    amount: number;
    transId: string;
  }): Promise<any>;
}