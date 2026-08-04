import { ComponentType, SVGProps } from 'react';

// One-time gradient defs — render <IconDefs /> once in App root
export const IconDefs = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
    <defs>
      <linearGradient id="icon-grad" gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="21" y2="21">
        <stop offset="0" stopColor="#f0cc70" />
        <stop offset="0.55" stopColor="#c9962a" />
        <stop offset="1" stopColor="#5ac8e6" />
      </linearGradient>
    </defs>
  </svg>
);

export type IconProps = SVGProps<SVGSVGElement> & { solid?: boolean };

// Widened shape for icon-in-a-prop / icon-in-an-array spots that still mix in
// leftover lucide icons.
export type IconComponent = ComponentType<{ className?: string; solid?: boolean }>;

const makeIcon = (d: string) => ({ solid, ...props }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width="1em" height="1em"
    fill="none"
    // solid = current-color mode (for icons sitting on gold pills / gold buttons);
    // default = gradient stroke
    stroke={solid ? 'currentColor' : 'url(#icon-grad)'}
    strokeWidth={1.9}
    strokeLinecap="square"
    strokeLinejoin="miter"
    aria-hidden
    {...props}
  >
    <path d={d} />
  </svg>
);

/* ── Spec set ─────────────────────────────────────────────────────────── */

export const HomeIcon = makeIcon('M4 11.5 12 4.5l8 7M6.2 10v9.5h4v-5h3.6v5h4V10');
export const JournalIcon = makeIcon('M6.5 3.5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1ZM9.5 3.5v17M12.5 8h3.5M12.5 12h3.5');
export const CalculatorIcon = makeIcon('M6 3.5h12a1.2 1.2 0 0 1 1.2 1.2v14.6a1.2 1.2 0 0 1-1.2 1.2H6a1.2 1.2 0 0 1-1.2-1.2V4.7A1.2 1.2 0 0 1 6 3.5ZM8 6.5h8v3H8ZM8.4 13.2h.2M11.9 13.2h.2M15.4 13.2h.2M8.4 16.8h.2M11.9 16.8h.2M15.4 16.8h.2');
export const TrendIcon = makeIcon('M3 17.5 8.5 12l3.5 3.5 7-7.5M14.5 7.5h5v5');
// Vertical mirror of TrendIcon (y -> 24 - y) so TrendingDown keeps the same weight.
export const TrendDownIcon = makeIcon('M3 6.5 8.5 12l3.5-3.5 7 7.5M14.5 16.5h5v-5');
export const LiveIcon = makeIcon('M11 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.8 18.2a9 9 0 0 1 0-12.4M18.2 5.8a9 9 0 0 1 0 12.4');
export const UsersIcon = makeIcon('M5.8 8.8a3.2 3.2 0 1 0 6.4 0 3.2 3.2 0 1 0-6.4 0M3.5 19.5c0-3 2.4-5 5.5-5s5.5 2 5.5 5M15.5 6a2.6 2.6 0 0 1 0 5.2M17.5 14.8c2.2.5 3.5 2.1 3.5 4.7');
export const SettingsIcon = makeIcon('M4 7h8.1M15.4 7H20M12.1 7a1.65 1.65 0 1 0 3.3 0 1.65 1.65 0 1 0-3.3 0M4 12h3.1M10.4 12H20M7.1 12a1.65 1.65 0 1 0 3.3 0 1.65 1.65 0 1 0-3.3 0M4 17h10.1M17.4 17H20M14.1 17a1.65 1.65 0 1 0 3.3 0 1.65 1.65 0 1 0-3.3 0');
export const LogoutIcon = makeIcon('M14 4.5h3.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H14M9.5 8.5 6 12l3.5 3.5M6 12h9');
export const PlusIcon = makeIcon('M12 5.5v13M5.5 12h13');
export const TrashIcon = makeIcon('M4.5 7h15M9.2 7V5.2A1.2 1.2 0 0 1 10.4 4h3.2a1.2 1.2 0 0 1 1.2 1.2V7M6.5 7l.9 12.5h9.2L17.5 7M10 10.5v5.5M14 10.5v5.5');
export const EditIcon = makeIcon('M4.5 19.5l.9-3.6L16.6 4.7a2 2 0 0 1 2.8 2.8L8.2 18.7l-3.7.8ZM14.6 6.7l2.8 2.8');
export const EyeIcon = makeIcon('M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12ZM9.2 12a2.8 2.8 0 1 0 5.6 0 2.8 2.8 0 1 0-5.6 0');
export const LockIcon = makeIcon('M7 10.5h10a1.5 1.5 0 0 1 1.5 1.5v6.5A1.5 1.5 0 0 1 17 20H7a1.5 1.5 0 0 1-1.5-1.5V12A1.5 1.5 0 0 1 7 10.5ZM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14v2.5');
export const SearchIcon = makeIcon('M5 11a6 6 0 1 0 12 0 6 6 0 1 0-12 0M15.5 15.5l5 5');
export const CalendarIcon = makeIcon('M5 5.5h14a1.2 1.2 0 0 1 1.2 1.2V19a1.2 1.2 0 0 1-1.2 1.2H5A1.2 1.2 0 0 1 3.8 19V6.7A1.2 1.2 0 0 1 5 5.5ZM3.8 9.5h16.4M8 3.5v3.5M16 3.5v3.5');
export const ArrowUpRightIcon = makeIcon('M7 17 17 7M9.5 7H17v7.5');
export const ArrowDownRightIcon = makeIcon('M7 7l10 10M17 9.5V17H9.5');
export const PanelIcon = makeIcon('M4.5 4.5h15a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1ZM15 4.5v15');

/* ── Extended set ─────────────────────────────────────────────────────────
   Same drawing language as above: 24×24 box, ~3.5–20.5 margins, square caps,
   miter joins, straight runs with sharp corners. Shared primitives below keep
   the recurring ring / frame / slash identical across glyphs. */

const RING = 'M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 1 0-17 0';
const CAL = 'M5 5.5h14a1.2 1.2 0 0 1 1.2 1.2V19a1.2 1.2 0 0 1-1.2 1.2H5A1.2 1.2 0 0 1 3.8 19V6.7A1.2 1.2 0 0 1 5 5.5ZM3.8 9.5h16.4M8 3.5v3.5M16 3.5v3.5';
const SCREEN = 'M3.5 4.5h17a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1ZM8.5 20.5h7M12 16v4.5';
// Corner-to-corner strike used by every "off"/"muted" variant.
const SLASH = 'M3.5 3.5l17 17';

// Navigation & chrome
export const ChevronDownIcon = makeIcon('M6 9 12 15 18 9');
export const ChevronLeftIcon = makeIcon('M14.5 5.5 8 12l6.5 6.5');
export const ChevronRightIcon = makeIcon('M9.5 5.5 16 12l-6.5 6.5');
export const ArrowRightIcon = makeIcon('M4 12h15M13 6l6 6-6 6');
export const ArrowLeftIcon = makeIcon('M20 12H5M11 6l-6 6 6 6');
export const SortIcon = makeIcon('M7.5 20.5V4M4 7.5 7.5 4 11 7.5M16.5 3.5V20M13 16.5l3.5 3.5 3.5-3.5');
export const CloseIcon = makeIcon('M5.5 5.5 18.5 18.5M18.5 5.5 5.5 18.5');
export const GridIcon = makeIcon('M4 4h6.5v6.5H4ZM13.5 4H20v6.5h-6.5ZM4 13.5h6.5V20H4ZM13.5 13.5H20V20h-6.5Z');
export const ExpandIcon = makeIcon('M14.5 4.5H20v5.5M20 4.5 13.5 11M9.5 19.5H4V14M4 19.5 10.5 13');
export const ExternalLinkIcon = makeIcon('M13.5 4.5H20v6.5M20 4.5 11 13.5M17 14v5.5H4.5V7H10');
export const GripIcon = makeIcon('M9.5 6h.2M9.5 12h.2M9.5 18h.2M14.5 6h.2M14.5 12h.2M14.5 18h.2');

// Status & feedback
export const CheckIcon = makeIcon('M4.5 12.5 9.5 17.5 19.5 6.5');
export const CheckCircleIcon = makeIcon(`${RING}M7.8 12.2 10.7 15.1 16.2 9.1`);
export const XCircleIcon = makeIcon(`${RING}M9 9l6 6M15 9l-6 6`);
export const AlertIcon = makeIcon(`${RING}M12 7.2v5.6M12 16.2h.01`);
export const InfoIcon = makeIcon(`${RING}M12 11.2v5.6M12 7.6h.01`);
// Arc rather than a full ring — it reads as motion under `animate-spin`.
export const LoaderIcon = makeIcon('M12 3.5a8.5 8.5 0 1 0 8.5 8.5');
export const RefreshIcon = makeIcon('M20 6.5v5h-5M4 17.5v-5h5M4.7 10.2a7.6 7.6 0 0 1 12.6-3.1L20 9.5M19.3 13.8a7.6 7.6 0 0 1-12.6 3.1L4 14.5');
export const ResetIcon = makeIcon('M4 6.5v5h5M4.7 11.4a7.6 7.6 0 1 1 1.7 5.5');

// Content & documents
export const FileIcon = makeIcon('M6 3.5h7l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1ZM13 3.5v5h5M8.5 13h7M8.5 16.5h7');
export const QuizIcon = makeIcon('M9 3.5h6v3H9ZM9 5H6a1 1 0 0 0-1 1v13.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3M8.5 11h.2M11.5 11h4M8.5 14.5h.2M11.5 14.5h4M8.5 18h.2M11.5 18h4');
export const ListIcon = makeIcon('M8.5 6.5h11.5M8.5 12h11.5M8.5 17.5h11.5M4 6.4h.2M4 11.9h.2M4 17.4h.2');
export const AlignLeftIcon = makeIcon('M4 6h16M4 10.5h9M4 15h16M4 19.5h9');
export const TextIcon = makeIcon('M4.5 6.5V4.5h15v2M12 4.5v15M8.5 19.5h7');
export const HashIcon = makeIcon('M9.5 4 8 20M16 4l-1.5 16M4 9h15.5M3.5 15H19');
export const TagIcon = makeIcon('M3.5 3.5h8L20.5 12.5l-8 8L3.5 11.5v-8ZM7.4 7.4h.2');
export const FilterIcon = makeIcon('M3.5 4.5h17l-6.5 8v6l-4 2.5v-8.5Z');
export const ImageIcon = makeIcon('M4.5 4.5h15a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1ZM8 9.5h.2M3.5 16.5 9 11l4.5 4.5 3-3 4 4');
export const FilmIcon = makeIcon('M3.5 4.5h17v15h-17ZM3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4M7.5 4.5v15M16.5 4.5v15');
export const AttachIcon = makeIcon('M18.5 11.5 11.8 18.2a4 4 0 0 1-5.7-5.7l7.6-7.6a2.7 2.7 0 0 1 3.8 3.8l-7.6 7.6a1.3 1.3 0 0 1-1.9-1.9l6.7-6.7');
export const CopyIcon = makeIcon('M8.5 8.5h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1ZM4.5 15.5h-1a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1');
export const UploadIcon = makeIcon('M12 15.5V4M7.5 8.5 12 4l4.5 4.5M4 15.5v3.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3.5');
export const LinkIcon = makeIcon('M9 12h6M10 7.5H7.5a4.5 4.5 0 0 0 0 9H10M14 7.5h2.5a4.5 4.5 0 0 1 0 9H14');
export const BarChartIcon = makeIcon('M3.5 3.5v17h17M8 17v-5M12.5 17V8M17 17v-8');
export const PulseIcon = makeIcon('M3 12h4l2.5-6.5 4.5 13 2.5-6.5h4.5');

// Messaging
export const MessageIcon = makeIcon('M3.5 4.5h17v12H9l-5.5 4.5V4.5Z');
export const CommentIcon = makeIcon('M3.5 12a8.5 8.5 0 1 1 4 7.2L3.5 20.5l1.3-4A8.4 8.4 0 0 1 3.5 12Z');
export const QuestionIcon = makeIcon('M3.5 4.5h17v12H9l-5.5 4.5V4.5ZM9.6 8.7a2.6 2.6 0 0 1 5 .9c0 1.6-2.5 2-2.5 3.4M12 15.1h.01');
export const SendIcon = makeIcon('M20.5 3.5 3.5 10.5l7 3 3 7 7-17ZM10.5 13.5 20.5 3.5');
export const ReplyIcon = makeIcon('M9.5 6.5 4 12l5.5 5.5M4 12h9a7 7 0 0 1 7 7v1.5');
export const MailIcon = makeIcon('M3.5 5.5h17a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1ZM2.5 6.5 12 13l9.5-6.5');
export const BellIcon = makeIcon('M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10ZM10.2 18.5a2 2 0 0 0 3.6 0');
export const BellOffIcon = makeIcon(`M8.6 5.4A5.5 5.5 0 0 1 17.5 10c0 2.1.4 3.5.8 4.4M6.5 10.6c0 3.7-1.5 4.9-1.5 4.9h10.4M10.2 18.5a2 2 0 0 0 3.6 0${SLASH}`);
export const PinIcon = makeIcon('M9 3.5h6l-.8 5.5 3.3 3v2H6.5v-2l3.3-3L9 3.5ZM12 14v6.5');
export const PinOffIcon = makeIcon(`M9 3.5h6l-.8 5.5 1.6 1.5M8.3 10.4 6.5 12v2h8.6M12 14v6.5${SLASH}`);

// People
export const UserIcon = makeIcon('M8 7.5a4 4 0 1 0 8 0 4 4 0 1 0-8 0M4.5 20.5c0-3.6 3.2-6 7.5-6s7.5 2.4 7.5 6');
export const UserRemoveIcon = makeIcon('M5.5 7.5a4 4 0 1 0 8 0 4 4 0 1 0-8 0M2.5 20.5c0-3.6 3.2-6 7-6 1.1 0 2.2.2 3.1.5M16.5 14.5l5 5M21.5 14.5l-5 5');
export const GraduationIcon = makeIcon('M12 4 2.5 8.5 12 13l9.5-4.5L12 4ZM6.5 10.7V16c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-5.3M21.5 8.5v6');
export const ShieldIcon = makeIcon('M12 3.5 4.5 6.5v6c0 4.5 3.2 7 7.5 8.5 4.3-1.5 7.5-4 7.5-8.5v-6L12 3.5ZM8.8 11.8 11.2 14.2 15.5 9.9');
export const UnlockIcon = makeIcon('M7 10.5h10a1.5 1.5 0 0 1 1.5 1.5v6.5A1.5 1.5 0 0 1 17 20H7a1.5 1.5 0 0 1-1.5-1.5V12A1.5 1.5 0 0 1 7 10.5ZM8.5 10.5V8a3.5 3.5 0 0 1 6.8-1.2M12 14v2.5');
export const KeyIcon = makeIcon('M7.5 12a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0M14.5 12H21M18 12v3M20 12v2');
export const CameraIcon = makeIcon('M3.5 7.5h4L9 5h6l1.5 2.5h4a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1ZM8.5 13a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0');
export const WalletIcon = makeIcon('M3.5 7.5h15a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-15a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1ZM2.5 7.5V6a1 1 0 0 1 1-1h12v2.5M15.5 13.5h3');

// Live room & media
export const VideoIcon = makeIcon('M3.5 6.5h11a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM15.5 10.5 20.5 7.5v9l-5-3Z');
export const VideoOffIcon = makeIcon(`M3.5 6.5h9M2.5 8.7v7.8a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-2M15.5 10.5 20.5 7.5v8${SLASH}`);
export const MicIcon = makeIcon('M12 3.5a2.5 2.5 0 0 1 2.5 2.5v6a2.5 2.5 0 0 1-5 0V6A2.5 2.5 0 0 1 12 3.5ZM6.5 11v1a5.5 5.5 0 0 0 11 0v-1M12 17.5v3M8.5 20.5h7');
export const MicOffIcon = makeIcon(`M9.5 6.6V6a2.5 2.5 0 0 1 5 0v5.4M9.5 10.6V12a2.5 2.5 0 0 0 4.1 1.9M6.5 11v1a5.5 5.5 0 0 0 8.9 4.3M12 17.5v3M8.5 20.5h7${SLASH}`);
export const VolumeIcon = makeIcon('M4.5 9.5h3L12 5.5v13L7.5 14.5h-3ZM15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.5a7.8 7.8 0 0 1 0 11');
export const VolumeOffIcon = makeIcon('M4.5 9.5h3L12 5.5v13L7.5 14.5h-3ZM16 9.5l5 5M21 9.5l-5 5');
export const HeadphonesIcon = makeIcon('M4 14.5V12a8 8 0 0 1 16 0v2.5M4 13.5h2.5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4ZM20 13.5h-2.5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1H20Z');
export const HangUpIcon = makeIcon('M2.5 15 5.5 12a13 13 0 0 1 13 0l3 3-2.5 2.5-3.2-1.6v-2.4a10.5 10.5 0 0 0-7.6 0v2.4L5 17.5Z');
export const ScreenIcon = makeIcon(SCREEN);
export const ScreenOffIcon = makeIcon(`M8.5 20.5h7M12 16v4.5M2.5 7.8v7.2a1 1 0 0 0 1 1h12.5M7.8 4.5h12.7a1 1 0 0 1 1 1v9.2${SLASH}`);
export const ScreenPlayIcon = makeIcon(`${SCREEN}M10.5 7.8 14.8 10.3 10.5 12.8Z`);
export const PlayIcon = makeIcon('M7.5 4.5 19 12 7.5 19.5Z');
export const PauseIcon = makeIcon('M8.5 4.5v15M15.5 4.5v15');
export const StopIcon = makeIcon(`${RING}M9.5 9.5h5v5h-5Z`);
export const WifiIcon = makeIcon('M2.5 8.5a14 14 0 0 1 19 0M5.8 12a9.4 9.4 0 0 1 12.4 0M9 15.5a4.7 4.7 0 0 1 6 0M12 19h.01');
export const WifiOffIcon = makeIcon(`M2.5 8.5a14 14 0 0 1 5-3.2M14 5.6a14 14 0 0 1 7.5 2.9M5.8 12a9.4 9.4 0 0 1 3-1.9M9 15.5a4.7 4.7 0 0 1 4.6-.6M12 19h.01${SLASH}`);
export const GlobeIcon = makeIcon(`${RING}M3.5 12h17M12 3.5a13 13 0 0 1 0 17 13 13 0 0 1 0-17`);

// Time & calendar
export const ClockIcon = makeIcon(`${RING}M12 7v5.4l3.5 2.1`);
export const CalendarPlusIcon = makeIcon(`${CAL}M12 12.5v5M9.5 15h5`);
export const CalendarClockIcon = makeIcon('M20.2 11V6.7A1.2 1.2 0 0 0 19 5.5H5a1.2 1.2 0 0 0-1.2 1.2V19A1.2 1.2 0 0 0 5 20.2h6M3.8 9.5h16.4M8 3.5v3.5M16 3.5v3.5M13 16.5a4 4 0 1 0 8 0 4 4 0 1 0-8 0M17 14.6v2l1.4.9');

// Misc tools & awards
export const MinusIcon = makeIcon('M5.5 12h13');
export const ZapIcon = makeIcon('M13.5 2.5 4.5 13.5h6.5l-1 8 9-11h-6.5l1-8Z');
export const HintIcon = makeIcon('M9 17h6M9.8 20.5h4.4M8 13.5a5 5 0 1 1 8 0c-.9 1.1-1.2 2-1.2 3.5H9.2c0-1.5-.3-2.4-1.2-3.5Z');
export const TargetIcon = makeIcon(`${RING}M7.5 12a4.5 4.5 0 1 0 9 0 4.5 4.5 0 1 0-9 0M11.2 12a.8.8 0 1 0 1.6 0 .8.8 0 1 0-1.6 0`);
export const TrophyIcon = makeIcon('M7 4.5h10v5.5a5 5 0 0 1-10 0V4.5ZM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 15v3.5M8.5 20.5h7');
export const AwardIcon = makeIcon('M7 8.5a5 5 0 1 0 10 0 5 5 0 1 0-10 0M8.4 12.8 7 20.5l5-2.5 5 2.5-1.4-7.7');
export const StarIcon = makeIcon('M12 3.5 15 9.6l6.5.9-4.8 4.6 1.2 6.4L12 18.5l-5.9 3 1.2-6.4L2.5 10.5l6.5-.9L12 3.5Z');
export const FlaskIcon = makeIcon('M9.5 3.5v6.2L4 19a1 1 0 0 0 .9 1.5h14.2A1 1 0 0 0 20 19l-5.5-9.3V3.5M8.5 3.5h7M6.8 14.5h10.4');
export const EraserIcon = makeIcon('M8.5 20.5H20M4.4 16.6 12 9l5 5-6.4 6.5H7L4.4 17.9ZM12 9l4.5-4.5a1.5 1.5 0 0 1 2.1 0l2.9 2.9a1.5 1.5 0 0 1 0 2.1L17 14');
export const EyeOffIcon = makeIcon(`M9.5 5.9A9.8 9.8 0 0 1 12 5.8c6 0 9.5 6.2 9.5 6.2a17 17 0 0 1-3.2 3.9M6.4 7.6A16.6 16.6 0 0 0 2.5 12s3.5 6.2 9.5 6.2a9.6 9.6 0 0 0 3.6-.7M10 10a2.8 2.8 0 0 0 4 4${SLASH}`);
