import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HeroSection from "@/components/HeroSection";
import FeaturedProducts from "@/components/FeaturedProducts";
import CategoriesSection from "@/components/CategoriesSection";
import WhyChooseUs from "@/components/WhyChooseUs";
import ReferralBanner from "@/components/ReferralBanner";
import Newsletter from "@/components/Newsletter";
import { AdvertisementBanner } from "@/components/AdvertisementBanner";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <AdvertisementBanner placement="home_top" />
        <FeaturedProducts />
        <AdvertisementBanner placement="home_sidebar" />
        <CategoriesSection />
        <ReferralBanner />
        <WhyChooseUs />
        <AdvertisementBanner placement="home_bottom" />
        <Newsletter />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
