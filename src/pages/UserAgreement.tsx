import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { UserAgreementBody } from "@/components/UserAgreementDialog";
import { USER_AGREEMENT_TITLE } from "@/lib/userAgreement";

const UserAgreementPage = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">{USER_AGREEMENT_TITLE}</h1>
          <UserAgreementBody />
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default UserAgreementPage;
