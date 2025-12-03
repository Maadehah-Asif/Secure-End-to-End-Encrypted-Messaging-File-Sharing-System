import React from 'react'
import '../styles/forms.css'

export default function AuthLayout({ title, image, children }) {
  return (
    <div className="auth-split">
      <div className="auth-left">
        <img className="auth-image" src={image} alt="illustration" />
      </div>
      <div className="auth-right">
        <div className="auth-right-inner">
          {children}
          {title ? (<h2 style={{ marginTop: 12 }}>{title}</h2>) : null}
        </div>
      </div>
    </div>
  )
}
