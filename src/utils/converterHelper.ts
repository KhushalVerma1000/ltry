import { ApiError } from "./ApiError.js";

const arrayParserStringToArray = (data: any): string[]=> {
    if (Array.isArray(data)) return data;
    if (typeof data === 'string') return JSON.parse(data);
    throw new ApiError(400, "Invalid seats format");
}

export{arrayParserStringToArray}


