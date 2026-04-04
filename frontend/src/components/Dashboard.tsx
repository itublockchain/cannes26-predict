import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserProfile } from '../App';

export interface DashboardProps {
  profile: UserProfile | null;
}

export const Dashboard: React.FC<DashboardProps> = ({ profile }) => {
  const navigate = useNavigate();

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Main Content Wrapper (Centers everything generally) */}
      <div className="flex flex-row items-center justify-center w-full flex-1 gap-10 lg:gap-32 px-10 relative z-10 scale-90 xl:scale-100 origin-center">

      {/* Avatar on Sphere Block */}
        <div className="w-[450px] lg:w-[500px] h-[700px] flex flex-col items-center justify-center pointer-events-none flex-shrink-0">
          <div className="text-4xl font-bold text-white z-[3] mb-8">
            {profile?.nickname || 'Player'}
          </div>
          <div className="z-[2] animate-float-avatar -mb-16">
            <img 
              src={`https://api.dicebear.com/8.x/adventurer/svg?seed=${profile?.avatar || 'Felix'}`} 
              alt="Current Avatar" 
              className="w-[200px] h-[200px] lg:w-[250px] lg:h-[250px] pointer-events-auto"
            />
          </div>
          {/* Glassmorphic 3D Energy Sphere */}
          <div 
            className="w-[350px] h-[350px] lg:w-[450px] lg:h-[450px] rounded-full z-[1] border-t border-[#a07aff]/40 shadow-2xl pointer-events-auto"
            style={{
              background: 'radial-gradient(circle at 35% 20%, rgba(200, 180, 255, 0.9) 0%, rgba(120, 80, 240, 0.85) 20%, rgba(30, 10, 120, 0.95) 55%, rgba(5, 0, 30, 1) 90%)',
              boxShadow: 'inset -50px -50px 100px rgba(0,0,0,0.9), inset 20px 20px 80px rgba(255,255,255,0.4), 0 -20px 100px rgba(131,103,240,0.4), 0 0 150px rgba(66,0,255,0.3)',
            }}
          ></div>
        </div>

        {/* Play Button & Info Block */}
        <div className="flex flex-col items-start w-[400px] lg:w-[500px] flex-shrink-0 z-20 text-left">
          <h1 className="text-6xl lg:text-7xl font-extrabold mb-6 text-white leading-tight">
            CryptoPredict<br/>Arena
          </h1>
          <p className="text-xl lg:text-2xl text-[#a0a0c0] italic mb-12 lg:mb-16">
            Welcome back, <span className="text-[#ffcc00] not-italic">{profile?.nickname || 'Player'}</span>!
          </p>
          <button 
            onClick={() => navigate('/game')}
            className="bg-btn-gradient text-white border-none py-5 px-12 lg:py-6 lg:px-16 rounded-full text-2xl lg:text-3xl font-bold uppercase tracking-widest cursor-pointer btn-shadow transition-transform duration-100 outline-none hover:-translate-y-1 active:translate-y-2 pointer-events-auto"
          >
            PLAY NOW
          </button>
        </div>

      </div>
    </div>
  );
};
