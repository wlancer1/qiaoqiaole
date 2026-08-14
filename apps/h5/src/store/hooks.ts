import { useDispatch, useSelector } from 'react-redux';
import type { H5Dispatch, H5RootState } from './store';

export const useAppDispatch = useDispatch.withTypes<H5Dispatch>();
export const useAppSelector = useSelector.withTypes<H5RootState>();
