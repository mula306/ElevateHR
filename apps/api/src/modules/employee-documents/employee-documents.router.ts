import { NextFunction, Request, Response, Router } from 'express';
import { logger } from '../../shared/lib/logger';
import { requireRole } from '../../shared/middleware/rbac';
import {
  createEmployeeDocumentSchema,
  listEmployeeDocumentsQuerySchema,
  updateEmployeeDocumentSchema,
} from './employee-documents.schemas';
import {
  acknowledgeEmployeeDocument,
  createEmployeeDocument,
  listDocumentReferenceData,
  listEmployeeDocuments,
  updateEmployeeDocument,
} from './employee-documents.service';

const router = Router();
const requireDocumentWriteRole = requireRole('Admin', 'HR.Manager');

router.get('/reference-data', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listDocumentReferenceData();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listEmployeeDocumentsQuerySchema.parse(req.query);
    const data = await listEmployeeDocuments(query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireDocumentWriteRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createEmployeeDocumentSchema.parse(req.body);
    const document = await createEmployeeDocument(data);
    logger.info({ employeeDocumentId: document.id, createdBy: req.user?.oid }, 'Employee document created');
    res.status(201).json({ success: true, data: document });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireDocumentWriteRole, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateEmployeeDocumentSchema.parse(req.body);
    const document = await updateEmployeeDocument(req.params.id, data);
    logger.info({ employeeDocumentId: req.params.id, updatedBy: req.user?.oid }, 'Employee document updated');
    res.json({ success: true, data: document });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/acknowledge', requireDocumentWriteRole, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const document = await acknowledgeEmployeeDocument(req.params.id);
    logger.info({ employeeDocumentId: req.params.id, acknowledgedBy: req.user?.oid }, 'Employee document acknowledged');
    res.json({ success: true, data: document });
  } catch (error) {
    next(error);
  }
});

export default router;
