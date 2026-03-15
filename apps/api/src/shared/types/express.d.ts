export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        oid: string;
        name: string;
        email: string;
        roles: string[];
      };
    }
  }
}
