
import { UserPayload } from "../../types";

declare global {
  namespace Express {
    interface Request {
      merchantId?: string;
      user?: UserPayload;
    }
  }
}

export { };

