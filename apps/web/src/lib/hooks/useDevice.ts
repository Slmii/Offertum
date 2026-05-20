import useMediaQuery from '@mui/material/useMediaQuery';

export const useDevice = () => {
	const isXsDown = useMediaQuery(theme => theme.breakpoints.down('xs'));
	const isSmDown = useMediaQuery(theme => theme.breakpoints.down('sm'));
	const isMdDown = useMediaQuery(theme => theme.breakpoints.down('md'));
	const isLgDown = useMediaQuery(theme => theme.breakpoints.down('lg'));
	const isXlDown = useMediaQuery(theme => theme.breakpoints.down('xl'));

	const isXsUp = useMediaQuery(theme => theme.breakpoints.up('xs'));
	const isSmUp = useMediaQuery(theme => theme.breakpoints.up('sm'));
	const isMdUp = useMediaQuery(theme => theme.breakpoints.up('md'));
	const isLgUp = useMediaQuery(theme => theme.breakpoints.up('lg'));
	const isXlUp = useMediaQuery(theme => theme.breakpoints.up('xl'));

	const isMobile = isMdDown;

	return { isXsDown, isSmDown, isMdDown, isLgDown, isXsUp, isSmUp, isMdUp, isLgUp, isXlUp, isXlDown, isMobile };
};
