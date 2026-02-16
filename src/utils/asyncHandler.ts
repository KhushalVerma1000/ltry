const asyncHandler = (requestHandler:any)=>{
    (req:any,res:any,next:any)=>{
      Promise.resolve(requestHandler).catch( (err) => next (err))
    }
}

export {asyncHandler}