import { Disclaimer } from '@/components/disclaimer';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <>
      <Disclaimer />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="font-serif text-3xl font-semibold tracking-tight">PetitionPilot</div>
            <p className="mt-2 text-sm text-muted">O-1A evidence mapping with source-cited drafting and attorney sign-off</p>
          </div>
          <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
            <LoginForm />
          </div>
        </div>
      </main>
    </>
  );
}
