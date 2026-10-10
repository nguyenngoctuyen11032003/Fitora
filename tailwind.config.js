/** @type {import('tailwindcss').Config} */
const delays = {};
for (let d = 100; d <= 1600; d += 100) delays[d] = `${d}ms`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: { desk: '1100px' },
      fontFamily: {
        sans: ['"Albert Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        bg: 'var(--bg)',
        'bg-2': 'var(--bg-2)',
        card: 'var(--card)',
        'card-strong': 'var(--card-strong)',
        line: 'var(--line)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        gold: 'var(--gold)',
        ember: 'var(--ember)',
        danger: 'var(--danger)',
        protein: 'var(--protein)',
        carbs: 'var(--carbs)',
        fat: 'var(--fat)',
        fiber: 'var(--fiber)',
        water: 'var(--water)',
        burn: 'var(--burn)',
        ok: 'var(--ok)',
      },
      borderRadius: {
        card: '24px',
        frame: '54px',
      },
      letterSpacing: {
        display: '-0.05em',
        number: '-0.06em',
      },
      lineHeight: {
        display: '0.9',
        number: '0.78',
      },
      transitionDelay: delays,
      animationDelay: delays,
      keyframes: {
        'fade-slide-up': { from: { opacity: '0', transform: 'translateY(18px)' }, to: { opacity: '1', transform: 'none' } },
        'fade-slide-down': { from: { opacity: '0', transform: 'translateY(-18px)' }, to: { opacity: '1', transform: 'none' } },
        'fade-slide-left': { from: { opacity: '0', transform: 'translateX(28px)' }, to: { opacity: '1', transform: 'none' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.92)' }, to: { opacity: '1', transform: 'none' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'speed-reveal': {
          '0%': { opacity: '0', transform: 'translateX(-40px) skewX(-12deg)', filter: 'blur(10px)', clipPath: 'inset(0 100% 0 0)' },
          '60%': { opacity: '1', filter: 'blur(0)' },
          '100%': { opacity: '1', transform: 'none', filter: 'blur(0)', clipPath: 'inset(0 0 0 0)' },
        },
        'drop-in': {
          '0%': { opacity: '0', transform: 'translateY(-36px) scale(0.96)' },
          '70%': { opacity: '1', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        shimmer: { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(237,180,11,0.45)' },
          '100%': { boxShadow: '0 0 0 18px rgba(237,180,11,0)' },
        },
      },
      animation: {
        'fade-slide-up': 'fade-slide-up 0.7s cubic-bezier(0.22,1,0.36,1) both',
        'fade-slide-down': 'fade-slide-down 0.7s cubic-bezier(0.22,1,0.36,1) both',
        'fade-slide-left': 'fade-slide-left 0.7s cubic-bezier(0.22,1,0.36,1) both',
        'scale-in': 'scale-in 0.5s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 0.6s ease both',
        'speed-reveal': 'speed-reveal 1s cubic-bezier(0.16,1,0.3,1) both',
        'drop-in': 'drop-in 0.8s cubic-bezier(0.22,1,0.36,1) both',
        shimmer: 'shimmer 1.6s linear infinite',
        'sheet-up': 'sheet-up 0.42s cubic-bezier(0.22,1,0.36,1) both',
        'pulse-ring': 'pulse-ring 1.8s ease-out infinite',
      },
    },
  },
  plugins: [
    function ({ matchUtilities, theme }) {
      matchUtilities({ 'animate-delay': (value) => ({ animationDelay: value }) }, { values: theme('animationDelay') });
    },
  ],
};
