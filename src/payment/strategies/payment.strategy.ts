export interface PaymentStrategy {
  createPayment(data: {
    orderId: number;
    amount: number;
    orderIds?: number[]; // Batch payment: danh sách orderIds
  }): Promise<{ payUrl: string }>;

  verifySignature(data: any): boolean;

  refund?(data: {
    orderId: number;
    amount: number;
    transId: string;
  }): Promise<any>;
}