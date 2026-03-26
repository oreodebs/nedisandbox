from db import engine, Base
import models  # IMPORTANT: registers models on Base.metadata

def main():
    print("Connecting to:", engine.url)  # helps confirm the database name
    Base.metadata.create_all(bind=engine)
    print("✅ Tables created successfully.")

if __name__ == "__main__":
    main()