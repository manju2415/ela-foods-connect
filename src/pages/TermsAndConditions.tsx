import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermsAndConditions() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Terms and Conditions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 text-sm text-muted-foreground leading-relaxed">
              <section>
                <h2 className="text-lg font-semibold text-foreground mb-2">1. DEFINITIONS</h2>
                <p>"User" refers to any individual or entity who registers on the Platform to access or use its services.</p>
                <p className="mt-2">"Platform" refers to ELA FOODS AND SNACKS PRIVATE LIMITED, including its website, mobile applications, and all associated services.</p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground mb-2">2. REGISTRATION AND ACCOUNT</h2>
                <ul className="list-disc ml-5 space-y-1">
                  <li>You must be at least 18 years of age to register and use the Platform.</li>
                  <li>You agree to provide accurate, current, and complete information during registration and to update such information when necessary.</li>
                  <li>You are solely responsible for maintaining the confidentiality of your account credentials.</li>
                  <li>The Platform shall not be liable for any loss or damage arising from unauthorized access to your account due to your failure to safeguard login details.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground mb-2">3. USE OF THE PLATFORM</h2>
                <p>The Platform may be used for browsing, searching, and purchasing products or services.</p>
                <p className="mt-2">You agree not to:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Engage in illegal, fraudulent, or harmful activities</li>
                  <li>Attempt to hack, disrupt, or misuse the Platform</li>
                  <li>Send spam or unauthorized communications</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground mb-2">4. PRODUCTS AND SERVICES</h2>
                <ul className="list-disc ml-5 space-y-1">
                  <li>All products and services are subject to availability and confirmation.</li>
                  <li>Prices and offers may change without prior notice.</li>
                  <li>While we strive for accuracy, the Platform does not guarantee that product descriptions, pricing, or other content are error-free.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground mb-2">5. PAYMENT AND CASHBACK TERMS</h2>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Payments must be made through approved payment methods available on the Platform.</li>
                  <li>Any cashback or rewards:
                    <ul className="list-disc ml-5 space-y-1 mt-1">
                      <li>Will be credited to your Platform wallet</li>
                      <li>Can be used or redeemed as per the applicable cashback policy</li>
                    </ul>
                  </li>
                  <li>Cashback may be subject to validity periods and usage restrictions.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground mb-2">6. CANCELLATION AND REFUND POLICY</h2>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Orders may be cancelled in accordance with the Platform's cancellation policy.</li>
                  <li>Refunds, if applicable, will be processed based on the refund policy and timelines defined by the Platform.</li>
                  <li>Certain products or services may be non-refundable.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground mb-2">7. INTELLECTUAL PROPERTY</h2>
                <ul className="list-disc ml-5 space-y-1">
                  <li>All content on the Platform, including logos, text, graphics, images, and software, is the property of ELA FOODS AND SNACKS PRIVATE LIMITED or its licensors.</li>
                  <li>Unauthorized use, reproduction, or distribution of content is strictly prohibited.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground mb-2">8. DISCLAIMER AND LIMITATION OF LIABILITY</h2>
                <p>The Platform is provided on an "as is" and "as available" basis without any warranties.</p>
                <p className="mt-2">The Platform does not guarantee:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Uninterrupted or error-free operation</li>
                  <li>Accuracy or reliability of information</li>
                </ul>
                <p className="mt-2">To the fullest extent permitted by law, ELA FOODS AND SNACKS PRIVATE LIMITED shall not be liable for any direct, indirect, incidental, or consequential damages arising from the use of the Platform.</p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground mb-2">9. GOVERNING LAW</h2>
                <ul className="list-disc ml-5 space-y-1">
                  <li>These Terms shall be governed by and interpreted in accordance with the laws of India.</li>
                  <li>Any disputes shall be subject to the jurisdiction of competent courts in India.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground mb-2">10. REGISTRATION FEES</h2>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Any registration fee paid is non-refundable.</li>
                  <li>This fee is utilized for operational purposes, including sourcing and providing products at discounted prices.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground mb-2">11. CHANGES TO TERMS</h2>
                <ul className="list-disc ml-5 space-y-1">
                  <li>The Platform reserves the right to modify or update these Terms and Conditions at any time without prior notice.</li>
                  <li>Continued use of the Platform after changes constitutes acceptance of the updated Terms.</li>
                </ul>
              </section>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
