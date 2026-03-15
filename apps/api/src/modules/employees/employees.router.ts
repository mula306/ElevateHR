import { NextFunction, Request, Response, Router } from 'express';
import { requireRole } from '../../shared/middleware/rbac';
import { logger } from '../../shared/lib/logger';
import {
  createEmployeeSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
} from './employees.schemas';
import {
  createEmployee,
  getEmployeeById,
  listEmployees,
  terminateEmployee,
  updateEmployee,
} from './employees.service';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listEmployeesQuerySchema.parse(req.query);
    const result = await listEmployees(query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const employee = await getEmployeeById(req.params.id);

    if (!employee) {
      res.status(404).json({
        success: false,
        error: { code: 404, message: 'Employee not found' },
      });
      return;
    }

    res.json({ success: true, data: employee });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/',
  requireRole('Admin', 'HR.Manager'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createEmployeeSchema.parse(req.body);
      const employee = await createEmployee(data, req.user?.oid);

      logger.info({ employeeId: employee.id, createdBy: req.user?.oid }, 'Employee created');

      res.status(201).json({ success: true, data: employee });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/:id',
  requireRole('Admin', 'HR.Manager'),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const data = updateEmployeeSchema.parse(req.body);
      const employee = await updateEmployee(req.params.id, data, req.user?.oid);

      if (!employee) {
        res.status(404).json({
          success: false,
          error: { code: 404, message: 'Employee not found' },
        });
        return;
      }

      logger.info({ employeeId: employee.id, updatedBy: req.user?.oid }, 'Employee updated');

      res.json({ success: true, data: employee });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/:id',
  requireRole('Admin'),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const wasTerminated = await terminateEmployee(req.params.id, req.user?.oid);

      if (!wasTerminated) {
        res.status(404).json({
          success: false,
          error: { code: 404, message: 'Employee not found' },
        });
        return;
      }

      logger.info({ employeeId: req.params.id, deletedBy: req.user?.oid }, 'Employee terminated');

      res.json({ success: true, message: 'Employee record terminated successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
