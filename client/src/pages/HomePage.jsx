import { useNavigate } from 'react-router-dom'
import MainLayout from '../components/MainLayout.jsx'
import landingImg from '../assets/landing-page.jpg'
import '../styles/forms.css'

export default function HomePage() {
  const navigate = useNavigate()

  return (
    <MainLayout fullWidth>
      {/* FULL-BLEED HERO WRAPPER */}
      <div
        style={{
          position: 'relative',
          width: '100vw',
          minHeight: 'calc(100vh - var(--header-height))',
          overflow: 'hidden',
          marginLeft: 'calc(50% - 50vw)',
          marginRight: 'calc(50% - 50vw)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >

        {/* BACKGROUND IMAGE */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${landingImg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            zIndex: 1
          }}
        />

        {/* DARK OVERLAY */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15,23,36,0.35)',
            zIndex: 2
          }}
        />

        {/* CENTERED CARD */}
        <div
          style={{
            position: 'relative',
            zIndex: 3,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            style={{
              width: '90%',
              maxWidth: '760px',
              background: 'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(4px)',
              borderRadius: '16px',
              padding: '32px',
              textAlign: 'center',
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            }}
          >
            <h1 style={{ fontSize: '42px', marginBottom: '12px', color: '#47727F', fontWeight: '700' }}>
              Welcome to CipherLink
            </h1>

            <p style={{ fontSize: '18px', color: '#1f2937', marginBottom: '24px' }}>
              End-to-end encrypted messaging made simple.
            </p>

            <button
              className="btn"
              style={{ padding: '12px 26px', borderRadius: '9999px' }}
              onClick={() => navigate('/dashboard')}
            >
              Go to Dashboard
            </button>
          </div>
        </div>

      </div>
    </MainLayout>
  )
}
