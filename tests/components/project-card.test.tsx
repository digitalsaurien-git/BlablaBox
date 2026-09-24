import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectCard } from "@/components/project-card";

// Mock next/link pour éviter les erreurs de routeur
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const baseProject = {
  id: "abc-123",
  title: "Mon projet de test",
  projectKind: "UNDERSTAND_LISTEN",
  responseMode: "EXPLAIN",
  deliveryType: "COURSE_SUMMARY",
  audience: "Étudiants",
  contentVersion: 2,
  audioContentVersion: null,
  audioFilePath: null,
  createdAt: new Date("2026-06-15"),
};

describe("ProjectCard", () => {
  it("affiche le titre du projet", () => {
    render(<ProjectCard project={baseProject} />);
    expect(screen.getByText("Mon projet de test")).toBeInTheDocument();
  });

  it("affiche le type UNDERSTAND_LISTEN", () => {
    render(<ProjectCard project={baseProject} />);
    expect(screen.getByText("Comprendre & écouter")).toBeInTheDocument();
  });

  it("affiche le mode de réponse Explication", () => {
    render(<ProjectCard project={baseProject} />);
    expect(screen.getByText("Explication")).toBeInTheDocument();
  });

  it("affiche l'audience", () => {
    render(<ProjectCard project={baseProject} />);
    expect(screen.getByText("Étudiants")).toBeInTheDocument();
  });

  it("contient un lien vers la page du projet", () => {
    render(<ProjectCard project={baseProject} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/projects/abc-123");
  });

  it("affiche 'Audio prêt' quand l'audio est synchronisé", () => {
    const projectWithAudio = {
      ...baseProject,
      audioFilePath: "/audio/test.mp3",
      audioContentVersion: 2,
    };
    render(<ProjectCard project={projectWithAudio} />);
    expect(screen.getByText("Audio prêt")).toBeInTheDocument();
  });

  it("n'affiche pas 'Audio prêt' quand les versions diffèrent", () => {
    const projectDesync = {
      ...baseProject,
      audioFilePath: "/audio/test.mp3",
      audioContentVersion: 1,
    };
    render(<ProjectCard project={projectDesync} />);
    expect(screen.queryByText("Audio prêt")).not.toBeInTheDocument();
  });

  it("affiche le delivery type pour un projet historique", () => {
    const legacyProject = {
      ...baseProject,
      projectKind: "LEGACY",
      deliveryType: "IMMERSIVE_STORY",
    };
    render(<ProjectCard project={legacyProject} />);
    expect(screen.getByText("Projet historique")).toBeInTheDocument();
    expect(screen.getByText("Histoire immersive")).toBeInTheDocument();
  });
});
