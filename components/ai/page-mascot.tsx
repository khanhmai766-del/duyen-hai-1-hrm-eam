"use client";

/**
 * MASCOT 2D BÁM CON TRỎ — chép từ skill `page-mascot` (~/.agents/skills/page-mascot/mascot.tsx).
 *
 * Chép vào repo thay vì `npm i page-mascot`: file chỉ cần React, không gọi mạng, không phụ
 * thuộc gì thêm — thêm một gói bên thứ ba vào hệ thống nhà máy không đáng, nhất là khi vừa gỡ
 * three.js đi để cho nhẹ.
 *
 * KHÁC BẢN GỐC — cập nhật skill về sau thì chép lại file và áp lại các chỗ này:
 *   1. thêm prop `onClick` — chạy KÈM hiệu ứng boop, không thay thế nó;
 *   2. thêm prop `ariaLabel` — ghi đè nhãn "Boop the …" bằng nhãn thật của nút;
 *   3. dùng ĐỦ 9 biểu cảm (bản gốc chỉ dùng 5): tên ô đặt theo đúng hình đã vẽ của dh1, bấm bỏ
 *      bước "blink" (ô 0 vẽ mặt cười híp mắt, trùng với tim/lấp lánh nên trông như lặp), thêm
 *      biểu cảm nền `bashful` (rê chuột lâu) và `sleepy` (không thao tác 60 giây), và hai biểu
 *      cảm do chatbox kích hoạt qua `thinking` / `celebrate`.
 *
 * Nhân vật: hai sheet 3×3 ở public/mascots/dh1-*.webp, dựng từ characters/dh1/ bằng
 * `python <skill>/scripts/mascot.py dh1 --skip-generate`.
 */
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

const DIRECTIONS = [
  'up-left',
  'up',
  'up-right',
  'left',
  'center',
  'right',
  'down-left',
  'down',
  'down-right',
] as const

// Thứ tự ô của sheet 3×3. Tên theo HÌNH ĐÃ VẼ của dh1, không theo prompt gốc: ô 0 là mặt cười
// híp mắt (không phải chớp mắt), ô 4 là mắt ngôi sao (không phải nháy mắt).
const REACTIONS = [
  'smile',
  'heart',
  'sparkle',
  'surprised',
  'starstruck',
  'bashful',
  'sleepy',
  'dizzy',
  'delighted',
] as const

type Direction = (typeof DIRECTIONS)[number]
type Reaction = (typeof REACTIONS)[number]
export type MascotReaction = Reaction

// Clockwise from the right, matching atan2 with y pointing down.
const CLOCKWISE: Direction[] = [
  'right',
  'down-right',
  'down',
  'down-left',
  'left',
  'up-left',
  'up',
  'up-right',
]
const SECTOR = (Math.PI * 2) / CLOCKWISE.length
const HYSTERESIS = 0.12
const DEAD_ZONE = 70

const PAYOFFS: Reaction[] = ['heart', 'sparkle', 'delighted']
const BOOP_END = 700
const SQUASH_MS = 420
const DIZZY_AFTER = 4
const DIZZY_WINDOW = 1600
const DIZZY_END = 1100
/** Rê chuột lên mascot lâu chừng này thì ngượng. */
const BASHFUL_AFTER = 1500
/** Không động chuột, bàn phím, cuộn, chạm chừng này thì ngủ gật; thao tác lại là tỉnh. */
const SLEEPY_AFTER = 60_000
/** Mặt ngạc nhiên khi mascot hiện ra lúc trợ lý đang tra cứu. */
const SURPRISED_MS = 1600
/** Mặt mắt sao khi có câu trả lời trong lúc khung chat đóng. */
const STARSTRUCK_MS = 2600
/** Biểu cảm chào lại khi đóng chat, mascot hiện ra. */
const WELCOME_BACK_MS = 900

const SQUASH: Keyframe[] = [
  { transform: 'scale(1, 1)', easing: 'ease-in' },
  { transform: 'scale(1.10, 0.86)', offset: 0.18, easing: 'ease-out' },
  { transform: 'scale(0.95, 1.08)', offset: 0.45, easing: 'ease-in-out' },
  { transform: 'scale(1.03, 0.97)', offset: 0.72, easing: 'ease-in-out' },
  { transform: 'scale(1, 1)' },
]

// background-size 300% makes each cell a clean 0/50/100% step on both axes.
function cell(index: number): CSSProperties {
  return { backgroundPosition: `${(index % 3) * 50}% ${Math.floor(index / 3) * 50}%` }
}

function wrap(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

const layer: CSSProperties = {
  position: 'absolute',
  inset: 0,
  backgroundSize: '300% 300%',
  backgroundRepeat: 'no-repeat',
}

export type MascotProps = {
  /** The 3x3 sheet of head directions. A served path, or an imported image. */
  directions: string
  /** The 3x3 sheet of expressions. */
  reactions: string
  size?: number
  className?: string
  /** What a screen reader calls it. */
  label?: string
  /** Chạy KÈM hiệu ứng boop khi bấm — dùng để mở chatbox. */
  onClick?: () => void
  /** Ghi đè nhãn cho trình đọc màn hình; mặc định là "Boop the {label}". */
  ariaLabel?: string
  /** Đang tra cứu: lúc mascot hiện ra (hoặc bắt đầu tra cứu) thì ngạc nhiên một nhịp. */
  thinking?: boolean
  /** Tăng lên mỗi khi có câu trả lời mới trong lúc khung chat đóng → mặt mắt sao. */
  celebrate?: number
  /** Tăng lên mỗi khi trợ lý trả lời LỖI trong lúc khung chat đóng → mặt chóng mặt. */
  oops?: number
  /** Đổi `id` là hiện `reaction` trong `ms` (mặc định 1,6 giây) — dùng khi mascot đọc thông báo toast. */
  cue?: { id: string | number; reaction: Reaction; ms?: number } | null
}

/**
 * Số lần mascot đã hiện trong lần tải trang này. Bấm mascot là mở khung chat và mascot bị gỡ khỏi
 * trang ngay, nên tim/lấp lánh sau cú bấm gần như không kịp thấy — chúng được chiếu lúc mascot HIỆN
 * LẠI sau khi đóng chat. Lần hiện đầu tiên đã có bong bóng chào nên không chiếu.
 */
let appearances = 0

export function Mascot(props: MascotProps) {
  const { directions, reactions, size = 140, className, label = 'mascot', onClick, ariaLabel, thinking = false, celebrate = 0, oops = 0, cue = null } = props

  const buttonRef = useRef<HTMLButtonElement>(null)
  const squashRef = useRef<HTMLSpanElement>(null)
  const timersRef = useRef<number[]>([])
  const boopsRef = useRef({ count: 0, at: 0 })
  const [direction, setDirection] = useState<Direction>('center')
  // Biểu cảm có thời hạn (bấm, chóng mặt, ngạc nhiên, mắt sao) luôn thắng biểu cảm nền.
  const [reaction, setReaction] = useState<Reaction | null>(null)
  const [pointerInside, setPointerInside] = useState(false)
  const [bashful, setBashful] = useState(false)
  const [sleeping, setSleeping] = useState(false)
  const shown: Reaction | null = reaction ?? (bashful ? 'bashful' : sleeping ? 'sleepy' : null)

  // Hiện biểu cảm trong một khoảng rồi thôi — dùng chung hàng hẹn giờ với boop để cái sau huỷ cái trước.
  const flash = (next: Reaction, ms: number) => {
    timersRef.current.forEach(window.clearTimeout)
    timersRef.current = [window.setTimeout(() => setReaction(null), ms)]
    setReaction(next)
  }
  const flashRef = useRef(flash)
  useEffect(() => {
    flashRef.current = flash
  })

  // Lúc hiện ra: đang tra cứu thì ngạc nhiên; không thì chào lại bằng tim → lấp lánh → vui sướng.
  useEffect(() => {
    const seen = appearances++
    if (thinking) return
    if (seen > 0) flashRef.current(PAYOFFS[(seen - 1) % PAYOFFS.length], WELCOME_BACK_MS)
    // Chỉ chạy lúc gắn; thay đổi `thinking` về sau do effect dưới lo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (thinking) flashRef.current('surprised', SURPRISED_MS)
  }, [thinking])

  // Bỏ qua giá trị lúc gắn: mascot hiện lại sau khi đóng chat không được phản ứng với câu trả lời cũ.
  const celebratedRef = useRef(celebrate)
  useEffect(() => {
    if (celebrate === celebratedRef.current) return
    celebratedRef.current = celebrate
    flashRef.current('starstruck', STARSTRUCK_MS)
  }, [celebrate])

  const oopsRef = useRef(oops)
  useEffect(() => {
    if (oops === oopsRef.current) return
    oopsRef.current = oops
    flashRef.current('dizzy', DIZZY_END)
  }, [oops])

  const cueId = cue?.id ?? null
  const cueRef = useRef(cue)
  useEffect(() => {
    cueRef.current = cue
  })
  useEffect(() => {
    const current = cueRef.current
    if (cueId === null || !current) return
    flashRef.current(current.reaction, current.ms ?? SURPRISED_MS)
  }, [cueId])

  useEffect(() => {
    if (!pointerInside) return
    const timer = window.setTimeout(() => setBashful(true), BASHFUL_AFTER)
    return () => window.clearTimeout(timer)
  }, [pointerInside])

  useEffect(() => {
    let timer = window.setTimeout(() => setSleeping(true), SLEEPY_AFTER)
    const wake = () => {
      window.clearTimeout(timer)
      setSleeping(false)
      timer = window.setTimeout(() => setSleeping(true), SLEEPY_AFTER)
    }
    const events = ['pointermove', 'pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((name) => window.addEventListener(name, wake, { passive: true }))
    return () => {
      window.clearTimeout(timer)
      events.forEach((name) => window.removeEventListener(name, wake))
    }
  }, [])

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      return
    }

    let sector = -1
    let pointer: { x: number; y: number } | null = null

    const aim = () => {
      const button = buttonRef.current
      if (!button || !pointer) {
        return
      }

      const box = button.getBoundingClientRect()
      const dx = pointer.x - (box.left + box.width / 2)
      const dy = pointer.y - (box.top + box.height / 2)

      if (Math.hypot(dx, dy) < DEAD_ZONE) {
        sector = -1
        setDirection('center')
        return
      }

      // Hold the current sector until the pointer is well past its edge.
      const angle = Math.atan2(dy, dx)
      if (sector !== -1 && Math.abs(wrap(angle - sector * SECTOR)) < SECTOR / 2 + HYSTERESIS) {
        return
      }

      sector = (Math.round(angle / SECTOR) + CLOCKWISE.length) % CLOCKWISE.length
      setDirection(CLOCKWISE[sector])
    }

    const onPointerMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY }
      aim()
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('scroll', aim, { passive: true })

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('scroll', aim)
    }
  }, [])

  useEffect(() => {
    return () => {
      timersRef.current.forEach(window.clearTimeout)
    }
  }, [])

  const boop = () => {
    timersRef.current.forEach(window.clearTimeout)
    timersRef.current = []

    const later = (ms: number, next: Reaction | null) => {
      timersRef.current.push(window.setTimeout(() => setReaction(next), ms))
    }

    const now = Date.now()
    const boops = boopsRef.current
    boops.count = now - boops.at < DIZZY_WINDOW ? boops.count + 1 : 1
    boops.at = now

    if (boops.count >= DIZZY_AFTER) {
      boops.count = 0
      setReaction('dizzy')
      later(DIZZY_END, null)
    } else {
      // Không còn bước "blink": ô đó vẽ cùng mặt cười híp mắt với tim/lấp lánh nên trông như lặp.
      setReaction(PAYOFFS[(boops.count - 1) % PAYOFFS.length])
      later(BOOP_END, null)
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    // Per-keyframe easing with the effect itself linear: an easing on the effect
    // would reinterpret every offset and front-load the whole bounce.
    squashRef.current?.animate(SQUASH, { duration: SQUASH_MS, easing: 'linear' })
  }

  // Inline styles so the file drops into any project without a CSS framework.
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => {
        boop();
        onClick?.();
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setPointerInside(true)
      }}
      onPointerLeave={() => {
        setPointerInside(false)
        setBashful(false)
      }}
      aria-label={ariaLabel ?? `Boop the ${label}`}
      className={className}
      style={{
        position: 'relative',
        display: 'block',
        flexShrink: 0,
        width: size,
        height: size,
        padding: 0,
        border: 0,
        background: 'transparent',
        appearance: 'none',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <span
        ref={squashRef}
        style={{ position: 'relative', display: 'block', width: '100%', height: '100%', transformOrigin: '50% 78%' }}
      >
        <span
          style={{
            ...layer,
            backgroundImage: `url(${directions})`,
            ...cell(DIRECTIONS.indexOf(direction)),
            opacity: shown ? 0 : 1,
          }}
        />
        {/* Always mounted so the sheet is fetched up front, never on the first click. */}
        <span
          style={{
            ...layer,
            backgroundImage: `url(${reactions})`,
            ...cell(REACTIONS.indexOf(shown ?? 'smile')),
            opacity: shown ? 1 : 0,
          }}
        />
      </span>
    </button>
  )
}
