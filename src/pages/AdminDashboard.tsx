import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };

    fetchUser();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <main className="container mx-auto p-4 mt-20">
        <Card>
          <CardHeader>
            <CardTitle>Tableau de bord d'administration</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4">
              Bienvenue, {user ? user.email : 'administrateur'} !
            </p>
            <Button onClick={handleLogout}>Se déconnecter</Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}