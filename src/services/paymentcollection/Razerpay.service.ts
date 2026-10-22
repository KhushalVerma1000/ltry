
import Razorpay from "razorpay";
import { ApiError } from "../../utils/ApiError.js";
import { validatePaymentVerification } from "razorpay/dist/utils/razorpay-utils.js";
import crypto from "node:crypto";

const Razerpay = new Razorpay({
  key_id: process.env.RAZERPAY_KEY_ID as string,
  key_secret: process.env.RAZERPAY_KEY_SECRET as string,
});

const createorder = async (amount:number, receipt:string) => {
  const options ={
    amount: amount *100,
    currency: "INR",
    partial_payment:false,
    receipt:receipt
  }

  const order = await Razerpay.orders.create(options)
  
  if(!order){
    throw new ApiError(500,"Failed to create order")
  }
  return order

}
 
;


const verifyPayment = async (req :any, res:any ) => {
 
  const {razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body
 
  if(!razorpay_payment_id || !razorpay_order_id || !razorpay_signature){
    throw new ApiError(400,"Missing required fields")
  }
  if(typeof razorpay_payment_id !== "string" || typeof razorpay_order_id !== "string" || typeof razorpay_signature !== "string"){
    throw new ApiError(400,"Invalid data types for required fields")
  }

const isvalid =  validatePaymentVerification({"order_id": razorpay_order_id, "payment_id": razorpay_payment_id }, razorpay_signature, process.env.RAZERPAY_KEY_SECRET as string);



  return isvalid;
}

// Webhook signature: HMAC-SHA256 of the *raw* request body using the webhook
// secret (set in Razorpay Dashboard > Webhooks; NOT the API key secret).
// Must be compared in constant time.
const verifyWebhookSignature = (rawBody: Buffer, signature: string | undefined) => {
  const secret = process.env.RAZERPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new ApiError(500, "Webhook secret is not configured");
  }
  if (!signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Refund a captured payment in full (amount in rupees). Used when a payment
// lands for a booking whose seats can no longer be honoured.
const refundPayment = async (paymentId: string, amountRupees: number, bookingId: string) => {
  return Razerpay.payments.refund(paymentId, {
    amount: Math.round(amountRupees * 100),
    speed: "normal",
    notes: { reason: "Seats unavailable for late payment", bookingId },
  });
};

export { createorder, verifyPayment, verifyWebhookSignature, refundPayment }
