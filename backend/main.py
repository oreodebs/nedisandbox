from fastapi import FastAPI


app = FastAPI(title="NEDI Backend")


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "NEDI backend is running"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
