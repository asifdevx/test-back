import express from 'express';
import {getRanking } from '../mongoDb/controllers/c.ranking';

const router = express.Router();

router.get('/collection', getRanking);

export default router;
