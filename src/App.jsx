import { useState } from 'react';
import WelcomeScreen from './pages/WelcomeScreen';
import TeacherApp from './pages/Teacher/TeacherApp';

function App() {
  const [currentRoute, setCurrentRoute] = useState('/');

  if (currentRoute === '/teacher-dashboard') {
    return <TeacherApp onLogout={() => setCurrentRoute('/')} />;
  }

  return (
    <WelcomeScreen onLogin={(role) => {
      if (role === 'Faculty') {
        setCurrentRoute('/teacher-dashboard');
      }
    }} />
  );
}

export default App;