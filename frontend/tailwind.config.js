/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Neue Haas Grotesk Display', 'sans-serif'],
      },
      colors: {
        brandPrimary: '#8367f0', // The purple accent
        brandGreen: '#44b62f', // Save button
        brandGreenLight: '#7ded5f', // Save button gradient top
      },
      backgroundImage: {
        'radial-space': 'radial-gradient(circle at center, #1a1a2e 0%, #0f0f1c 100%)',
        'stars-pattern': "url('https://www.transparenttextures.com/patterns/stardust.png')",
        'btn-gradient': 'linear-gradient(180deg, #7ded5f 0%, #44b62f 100%)',
      },
      animation: {
        'float-avatar': 'floatAvatar 4s ease-in-out infinite',
        'move-stars': 'moveStars 100s linear infinite',
        'blob-morph': 'blobMorph 7s ease-in-out infinite',
        'load-progress': 'loadProgress 2.5s ease-in-out infinite',
        'countdown-fill': 'countdownFill 3s ease-in-out forwards',
      },
      keyframes: {
        floatAvatar: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-15px)' },
        },
        moveStars: {
          'from': { backgroundPosition: '0 0' },
          'to': { backgroundPosition: '-10000px 5000px' },
        },
        blobMorph: {
          '0%':   { transform: 'rotate(13deg) scale(1, 1) translate(0px, 0px)' },
          '15%':  { transform: 'rotate(19deg) scale(1.12, 0.88) translate(4px, -12px)' },
          '30%':  { transform: 'rotate(7deg) scale(0.9, 1.11) translate(-5px, 7px)' },
          '47%':  { transform: 'rotate(21deg) scale(1.08, 0.91) translate(6px, -9px)' },
          '62%':  { transform: 'rotate(9deg) scale(0.93, 1.09) translate(-4px, 8px)' },
          '78%':  { transform: 'rotate(17deg) scale(1.06, 0.93) translate(5px, -6px)' },
          '100%': { transform: 'rotate(13deg) scale(1, 1) translate(0px, 0px)' },
        },
        loadProgress: {
          '0%':   { width: '8%' },
          '60%':  { width: '80%' },
          '100%': { width: '8%' },
        },
        countdownFill: {
          '0%': { width: '0%' },
          '100%': { width: '100%' },
        },
      }
    },
  },
  plugins: [],
}
