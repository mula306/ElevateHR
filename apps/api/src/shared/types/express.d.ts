export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        oid: string;
        name: string;
        email: string;
        roles: string[];
        scopes: string[];
      };
      account?: {
        id: string;
        entraObjectId: string | null;
        email: string;
        displayName: string;
        status: string;
        employeeId: string | null;
        lastSignedInAt: string | null;
        queueMemberships: string[];
        employee: {
          id: string;
          employeeNumber: string;
          firstName: string;
          lastName: string;
          fullName: string;
          department: string;
          jobTitle: string;
          status: string;
        } | null;
      };
    }
  }
}
