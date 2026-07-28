import express from 'express';
import { getEvents } from '../mongoDb/controllers/c.events';


const router = express.Router();

router.get('/', getEvents);


export default router;
