
import Razorpay from "razorpay";
import { ApiError } from "../../utils/ApiError.js";
import { validatePaymentVerification } from "razorpay/dist/utils/razorpay-utils.js";

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

export { createorder, verifyPayment}
