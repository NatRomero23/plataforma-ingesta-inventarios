import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles/theme.css';
import { PortalLayout } from './router';
import { Login } from './pages/Login';
import { PortalUpload } from './pages/PortalUpload';
import { MyLoads } from './pages/MyLoads';
import { Mailbox } from './pages/Mailbox';
import { LoadDetail } from './pages/LoadDetail';
import { Admin } from './pages/Admin';
import { PharmacyActivity } from './pages/PharmacyActivity';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<PortalLayout />}>
          <Route path="/subir" element={<PortalUpload />} />
          <Route path="/mis-cargas" element={<MyLoads />} />
          <Route path="/buzon" element={<Mailbox />} />
          <Route path="/carga/:loadId" element={<LoadDetail />} />
          <Route path="/actividad" element={<PharmacyActivity />} />
          <Route path="/admin" element={<Admin />} />
        </Route>
        <Route path="*" element={<Navigate to="/subir" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
