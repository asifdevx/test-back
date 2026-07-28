import express from 'express';
import { addFavorite, removeFavorite, checkFavorite, getFavoriteCount,  } from '../mongoDb/controllers/c.favourite';

const router = express.Router();

router.post('/', addFavorite);
router.delete('/', removeFavorite);
router.get('/check', checkFavorite);
router.get('/count', getFavoriteCount);


export default router;
