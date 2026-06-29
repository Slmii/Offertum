import { AppIcon, type AppIconName } from '@/components/AppIcon.component';
import { BannerStack, type BannerStackItem } from '@/components/BannerStack.component';
import { Dialog } from '@/components/Dialog.component';
import { StandaloneField } from '@/components/Form/Field/Field.component';
import { StandaloneSelect } from '@/components/Form/Select/Select.component';
import { type Option } from '@/components/Form/Select/Select.types';
import { BodySmall, H1, H3, Label } from '@/components/Text.component';
import { useToast } from '@/lib/hooks/use-toast';
import { catalogItemsQueryOptions } from '@/lib/queries/catalog-items.queries';
import {
	quoteDraftsQueryOptions,
	quotePdfDownloadUrl,
	useAddQuoteLineItem,
	useDeleteQuoteLineItem,
	useGenerateQuoteDraft,
	useGenerateQuotePdf,
	useGenerateQuotePreview,
	useReplaceQuoteLines,
	useUpdateQuoteLineItem
} from '@/lib/queries/quote-drafts.queries';
import { vatSettingsQueryOptions } from '@/lib/queries/vat-settings.queries';
import { toDaysUntil, toReadableDate } from '@/lib/utils/date.utils';
import { toReadableBytes, toReadableEuro } from '@/lib/utils/number.utils';
import { AddCatalogItemsDialog } from '@/routes/(app)/opportunities/-components/Quote/AddCatalogItemsDialog.component';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import {
	buildCatalogVatOptions,
	buildQuoteVatOptions,
	formatVatRateLabel,
	pluralize,
	QUOTE_LINE_DESCRIPTION_MAX_LENGTH,
	quoteVatLineToOptionId,
	quoteVatOptionToLine,
	VAT_REVERSE_CHARGE_OPTION_ID
} from '@offertum/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
