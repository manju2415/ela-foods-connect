import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HeroSection from "@/components/HeroSection";
import HomepageProductSections from "@/components/HomepageProductSections";
import CategoriesSection from "@/components/CategoriesSection";
import WhyChooseUs from "@/components/WhyChooseUs";
import ReferralBanner from "@/components/ReferralBanner";
import Newsletter from "@/components/Newsletter";
import { AdvertisementBanner } from "@/components/AdvertisementBanner";
import { AppHome } from "@/components/mobile/AppHome";
import { Capacitor } from "@capacitor/core";

interface IndexProps {
  hideChrome?: boolean;
}

const Index = ({ hideChrome = false }: IndexProps) => {
  return (
    <div className="min-h-screen flex flex-col">
      {!hideChrome && <Header />}
      <main className={`flex-1 ${hideChrome ? 'pb-16' : ''}`}>
        {Capacitor.isNativePlatform() ? (
          // Installed app: compact, shopping-first home.
          <AppHome />
        ) : (
          <>
            <HeroSection />
            <AdvertisementBanner placement="home_top" />
            <HomepageProductSections />
            <AdvertisementBanner placement="home_sidebar" />
            <CategoriesSection />
            <ReferralBanner />
            <WhyChooseUs />
            <AdvertisementBanner placement="home_bottom" />
            <Newsletter />
          </>
        )}
      </main>
      {!hideChrome && <Footer />}
    </div>
  );
};

export default Index;
